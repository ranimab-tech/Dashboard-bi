
(() => {

  function uid(){ return Math.random().toString(36).slice(2,9); }
  function loadSales(){ try{ const raw = localStorage.getItem('sales_v1'); return raw ? JSON.parse(raw) : []; }catch(e){ return []; } }
  function saveSales(sales){ localStorage.setItem('sales_v1', JSON.stringify(sales)); }
  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  const page = document.body.dataset.page || 'index';
  let sales = loadSales();

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle){
    themeToggle.checked = document.body.classList.contains('dark');
    themeToggle.addEventListener('change', e => {
      document.body.classList.toggle('dark', e.target.checked);

      try{ localStorage.setItem('dashboard_dark', e.target.checked ? '1' : '0'); }catch(e){}
    });
  }
  try{
    const pref = localStorage.getItem('dashboard_dark');
    if (pref === '1'){ document.body.classList.add('dark'); if (themeToggle) themeToggle.checked = true; }
  }catch(e){}

  if (page === 'index'){
    const fileInput = document.getElementById('fileInput');
    const importBtn = document.getElementById('importBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');

    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const applyFilterBtn = document.getElementById('applyFilterBtn');
    const resetFilterBtn = document.getElementById('resetFilterBtn');
    const tableSearch = document.getElementById('tableSearch'); // optional on index

    const totalRevenueEl = document.getElementById('totalRevenue');
    const bestProductEl = document.getElementById('bestProduct');
    const bestSellerEl = document.getElementById('bestSeller');
    const countSalesEl = document.getElementById('countSales');

    const dailySalesEl = document.getElementById('dailySales');
    const topProductDayEl = document.getElementById('topProductDay');
    const forecastEl = document.getElementById('forecast');

    const iaQuery = document.getElementById('iaQuery');
    const askIA = document.getElementById('askIA');
    const iaResponse = document.getElementById('iaResponse');

    let productChart = null, sellerChart = null, lineChart = null;

    function calculateForecast(salesList){
      if (!salesList || salesList.length < 2) return 'Pas assez de données pour prévision.';
      const cas = salesList.map(s => s.price * s.quantity);
      const avg = cas.reduce((a,b) => a + b, 0) / cas.length;
      const growth = (cas[cas.length - 1] - cas[0]) / cas.length;
      return `Prévision CA prochain mois: ~${(avg + growth).toFixed(2)} DT (croissance estimée: ${growth.toFixed(2)} DT)`;
    }

    function updateDailySummary(list){
      const today = new Date().toISOString().slice(0,10);
      const todaySales = list.filter(s => s.date === today);
      const totalToday = todaySales.reduce((acc,s) => acc + s.price * s.quantity, 0);
      dailySalesEl && (dailySalesEl.textContent = `Ventes aujourd'hui: ${totalToday.toFixed(2)} DT`);
      const prodToday = {};
      todaySales.forEach(s => prodToday[s.product] = (prodToday[s.product] || 0) + s.price * s.quantity);
      topProductDayEl && (topProductDayEl.textContent = `Top produit: ${Object.keys(prodToday).length ? Object.keys(prodToday).reduce((a,b)=> prodToday[a]>prodToday[b]?a:b) : '-'}`);
    }

    function renderKPIs(list){
      const total = list.reduce((acc,s)=> acc + s.price*s.quantity, 0);
      totalRevenueEl && (totalRevenueEl.textContent = `${total.toFixed(2)} DT`);
      countSalesEl && (countSalesEl.textContent = list.length);

      const prod = {};
      list.forEach(s => prod[s.product] = (prod[s.product] || 0) + s.price*s.quantity);
      bestProductEl && (bestProductEl.textContent = Object.keys(prod).length ? Object.keys(prod).reduce((a,b)=> prod[a]>prod[b]?a:b) : '-');

      const sell = {};
      list.forEach(s => sell[s.seller] = (sell[s.seller] || 0) + s.price*s.quantity);
      bestSellerEl && (bestSellerEl.textContent = Object.keys(sell).length ? Object.keys(sell).reduce((a,b)=> sell[a]>sell[b]?a:b) : '-');
    }

    function renderCharts(list){
      const productMap = {}, sellerMap = {}, dailyMap = {};
      list.forEach(s => {
        const ca = s.price * s.quantity;
        productMap[s.product] = (productMap[s.product] || 0) + ca;
        sellerMap[s.seller]  = (sellerMap[s.seller] || 0) + ca;
        dailyMap[s.date] = (dailyMap[s.date] || 0) + ca;
      });

      const prodLabels = Object.keys(productMap);
      const prodData   = prodLabels.map(k => productMap[k]);

      const sellLabels = Object.keys(sellerMap);
      const sellData   = sellLabels.map(k => sellerMap[k]);

      const dayLabels = Object.keys(dailyMap).sort();
      const dayData   = dayLabels.map(d => dailyMap[d]);

      try{ if (productChart) productChart.destroy(); }catch(e){}
      try{ if (sellerChart) sellerChart.destroy(); }catch(e){}
      try{ if (lineChart) lineChart.destroy(); }catch(e){}

      const pctx = document.getElementById('productChart').getContext('2d');
      productChart = new Chart(pctx, { type:'bar', data:{ labels: prodLabels, datasets:[{ label:'CA (DT)', data: prodData }]}, options:{ responsive:true, plugins:{ legend:{ display:false } } } });

      const sctx = document.getElementById('sellerChart').getContext('2d');
      sellerChart = new Chart(sctx, { type:'pie', data:{ labels: sellLabels, datasets:[{ data: sellData }]}, options:{ responsive:true } });

      const lctx = document.getElementById('lineChart').getContext('2d');
      lineChart = new Chart(lctx, { type:'line', data:{ labels: dayLabels, datasets:[{ label:'CA', data: dayData, fill:true, tension:0.25 }]}, options:{ responsive:true, plugins:{ legend:{ display:false } } } });
    }

    function applyFiltersAndRender(){
      const filterFrom = dateFrom.value ? new Date(dateFrom.value) : null;
      const filterTo   = dateTo.value ? new Date(dateTo.value) : null;
      const q = (tableSearch && tableSearch.value) ? tableSearch.value.trim().toLowerCase() : '';

      const filtered = sales.filter(s => {
        if (q && !(s.product.toLowerCase().includes(q) || s.seller.toLowerCase().includes(q))) return false;
        if (filterFrom && new Date(s.date) < filterFrom) return false;
        if (filterTo && new Date(s.date) > filterTo) return false;
        return true;
      });

      renderCharts(filtered);
      renderKPIs(filtered);
      updateDailySummary(filtered);
      forecastEl && (forecastEl.textContent = calculateForecast(filtered) || calculateForecast(sales));
    }

    if (importBtn){
      importBtn.addEventListener('click', () => {
        const f = fileInput.files[0];
        if (!f) { Swal.fire('Choisir un fichier','Sélectionnez un fichier .xlsx, .xls ou .csv','info'); return; }
        const reader = new FileReader();
        reader.onload = function(e){
          try{
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const arr = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            let added = 0;
            arr.forEach(row => {
              const norm = {};
              Object.keys(row).forEach(k => {
                const key = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s]+/g,'').toLowerCase();
                norm[key] = row[k];
              });
              const product = norm['produit'] || norm['product'] || 'Produit inconnu';
              const seller = norm['vendeur'] || norm['seller'] || 'Vendeur inconnu';
              const qty = parseFloat(norm['quantite'] || norm['quantity'] || norm['qty'] || 0);
              const price = parseFloat(norm['prixunitaire'] || norm['prix'] || norm['price'] || 0);
              let date = norm['date_vente'] || norm['date'] || '';
              if (date){
                if (typeof date === 'number'){
                  date = XLSX.SSF.format('yyyy-mm-dd', date);
                } else {
                  date = new Date(date).toISOString().slice(0,10);
                }
              } else { date = (new Date()).toISOString().slice(0,10); }
              if (!isNaN(qty) && qty>0 && !isNaN(price) && price>0){
                sales.push({ id: uid(), date, product, seller, quantity: qty, price });
                added++;
              }
            });
            if (added>0){ saveSales(sales); applyFiltersAndRender(); Swal.fire('Importation réussie', `${added} ventes ajoutées.`, 'success'); }
            else Swal.fire('Aucune donnée','Aucune ligne valide trouvée dans le fichier.','warning');
          }catch(err){
            Swal.fire('Erreur','Impossible de lire le fichier','error');
          }
        };
        reader.readAsArrayBuffer(f);
      });
    }
    exportCsvBtn && exportCsvBtn.addEventListener('click', () => {
      if (!sales.length) return Swal.fire('Aucune donnée','Aucune vente à exporter','info');
      const rows = [['Date','Produit','Vendeur','Quantité','Prix_Unitaire','CA']];
      sales.forEach(s => rows.push([s.date, s.product, s.seller, s.quantity, s.price, (s.price*s.quantity).toFixed(2)]));
      const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'ventes_export.csv'; a.click(); URL.revokeObjectURL(url);
    });

    exportExcelBtn && exportExcelBtn.addEventListener('click', () => {
      if (!sales.length) return Swal.fire('Aucune donnée','Aucune vente à exporter','info');
      const ws_data = [['Date','Produit','Vendeur','Quantité','Prix_Unitaire','CA']];
      sales.forEach(s => ws_data.push([s.date, s.product, s.seller, s.quantity, s.price, (s.quantity*s.price).toFixed(2)]));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      XLSX.utils.book_append_sheet(wb, ws, 'Ventes');
      XLSX.writeFile(wb, 'ventes_export.xlsx');
    });

    exportPdfBtn && exportPdfBtn.addEventListener('click', async () => {
      if (!sales.length) return Swal.fire('Aucune donnée','Aucune vente à exporter','info');
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation:'landscape' });
      doc.setFontSize(18);
      doc.text('Rapport ventes - Boutique Informatique', 14, 18);
      doc.setFontSize(11);
      const rows = sales.map(s => [s.date, s.product, s.seller, String(s.quantity), String(s.price), (s.quantity*s.price).toFixed(2)]);
      if (doc.autoTable){
        doc.autoTable({ head:[['Date','Produit','Vendeur','Quantité','Prix','CA']], body: rows, startY:28 });
        doc.save('ventes_report.pdf');
      } else {
        let y = 28;
        doc.setFontSize(9);
        rows.forEach(r => {
          doc.text(r.join('  |  '), 10, y);
          y += 6;
          if (y>190){ doc.addPage(); y = 20; }
        });
        doc.save('ventes_report.pdf');
      }
    });

    if (askIA){
      askIA.addEventListener('click', onAskIA);
      document.getElementById('iaQuery') && document.getElementById('iaQuery').addEventListener('keypress', e => { if (e.key === 'Enter') onAskIA(); });
    }
    function onAskIA(){
      const query = (iaQuery.value||'').trim().toLowerCase();
      if (!query) return;
      let response = "Désolé, je n'ai pas compris. Essayez une question sur ventes, produits, ou stock.";
      const totalCA = () => sales.reduce((sum, sale) => sum + sale.quantity * sale.price, 0);
      const productSales = () => { const productCount = {}; sales.forEach(sale => productCount[sale.product] = (productCount[sale.product] || 0) + sale.quantity); return productCount; };
      const sellerSales = () => { const sellerCount = {}; sales.forEach(sale => sellerCount[sale.seller] = (sellerCount[sale.seller] || 0) + sale.quantity); return sellerCount; };

      const productsSold = productSales(); const sellers = sellerSales();
      if (query.includes('ventes totales') || query.includes('chiffre d\'affaires') || query.includes('ca total')) {
        response = `Le chiffre d'affaires total est de ${totalCA()} DT.`;
      } else if (query.includes('meilleur produit') || query.includes('plus vendu') || query.includes('top produit')) {
        const best = Object.keys(productsSold).length ? Object.keys(productsSold).reduce((a,b) => productsSold[a] > productsSold[b] ? a : b) : '-';
        response = `Le produit le plus vendu est: ${best}.`;
      } else if (query.includes('meilleur vendeur') || query.includes('vendeur top')) {
        const bestSeller = Object.keys(sellers).length ? Object.keys(sellers).reduce((a,b)=> sellers[a] > sellers[b] ? a : b) : '-';
        response = `Le meilleur vendeur est: ${bestSeller}.`;
      } else if (query.includes('tendance') || query.includes('évolution')) {
        response = 'Tendances actuelles: vérifiez le graphique d\'évolution pour voir la tendance par jour.';
      }
      iaResponse && (iaResponse.textContent = response);
      iaQuery.value = '';
    }

    applyFilterBtn && applyFilterBtn.addEventListener('click', () => { applyFiltersAndRender(); });
    resetFilterBtn && resetFilterBtn.addEventListener('click', () => { dateFrom.value=''; dateTo.value=''; tableSearch && (tableSearch.value=''); applyFiltersAndRender(); });

    applyFiltersAndRender();

    window.addEventListener('storage', e => {
      if (e.key === 'sales_v1'){ sales = loadSales(); applyFiltersAndRender(); }
    });
  }

  if (page === 'add'){
    const productEl = document.getElementById('product');
    const priceEl = document.getElementById('price');
    const qtyEl = document.getElementById('quantity');
    const sellerEl = document.getElementById('seller');
    const addBtn = document.getElementById('addBtn');
    const clearBtn = document.getElementById('clearBtn');

    const errProduct = document.getElementById('err-product');
    const errPrice = document.getElementById('err-price');
    const errQty = document.getElementById('err-quantity');
    const errSeller = document.getElementById('err-seller');

    function validate(){
      let ok=true;
      errProduct.textContent=''; errPrice.textContent=''; errQty.textContent=''; errSeller.textContent='';
      if (!productEl.value.trim()){ errProduct.textContent = 'Produit requis'; ok=false; }
      if (!sellerEl.value.trim()){ errSeller.textContent = 'Vendeur requis'; ok=false; }
      const p = parseFloat(priceEl.value); if (isNaN(p) || p<=0){ errPrice.textContent='Prix invalide'; ok=false; }
      const q = parseFloat(qtyEl.value); if (isNaN(q) || q<=0){ errQty.textContent='Quantité invalide'; ok=false; }
      return ok;
    }

    addBtn && addBtn.addEventListener('click', () => {
      if (!validate()) return;
      const sale = {
        id: uid(),
        date: (new Date()).toISOString().slice(0,10),
        product: productEl.value.trim(),
        seller: sellerEl.value.trim(),
        quantity: Number(qtyEl.value),
        price: Number(priceEl.value)
      };
      sales.push(sale);
      saveSales(sales);
      try{ localStorage.setItem('sales_v1_updated_at', Date.now().toString()); }catch(e){}
      Toastify({ text: "Vente ajoutée ✓", duration: 1600, gravity: "top", position: "right", backgroundColor:"#5aaef0" }).showToast();

      setTimeout(() => { window.location.href = 'index.html'; }, 700);
    });

    clearBtn && clearBtn.addEventListener('click', () => {
      productEl.value=''; priceEl.value=''; qtyEl.value=''; sellerEl.value='';
      errProduct.textContent=''; errPrice.textContent=''; errQty.textContent=''; errSeller.textContent='';
    });
  }

  if (page === 'sales'){
    const tableBody = document.querySelector('#salesTable tbody');
    const tableSearch = document.getElementById('tableSearch');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');
    const pager = document.getElementById('pager');

    let rowsPerPage = 10;
    let currentPage = 1;

    function paginate(list){
      const start = (currentPage - 1) * rowsPerPage;
      return list.slice(start, start + rowsPerPage);
    }

    function renderTable(){
      const q = (tableSearch && tableSearch.value) ? tableSearch.value.trim().toLowerCase() : '';
      const list = sales.filter(s => {
        if (q){
          return s.product.toLowerCase().includes(q) || s.seller.toLowerCase().includes(q) || s.date.includes(q);
        }
        return true;
      });

      const totalPages = Math.max(1, Math.ceil(list.length / rowsPerPage));
      if (currentPage > totalPages) currentPage = totalPages;

      const display = paginate(list);

      tableBody.innerHTML = '';
      display.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${s.date}</td>
          <td>${escapeHtml(s.product)}</td>
          <td>${escapeHtml(s.seller)}</td>
          <td>${s.quantity}</td>
          <td>${s.price.toFixed(2)}</td>
          <td>${(s.quantity*s.price).toFixed(2)}</td>
          <td class="actions">
            <button class="edit-btn" data-id="${s.id}" title="Modifier"><i class="fas fa-pen"></i></button>
            <button class="delete-btn" data-id="${s.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
          </td>
        `;
        tableBody.appendChild(tr);
      });

      pager && (pager.textContent = `Page ${currentPage} / ${totalPages} — ${list.length} ligne(s)`);

      tableBody.querySelectorAll('.delete-btn').forEach(btn=>{
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          Swal.fire({ title:'Supprimer ?', text:"Cette vente sera supprimée définitivement.", icon:'warning', showCancelButton:true, confirmButtonText:'Oui, supprimer', cancelButtonText:'Annuler' }).then(res=>{
            if (res.isConfirmed){
              sales = sales.filter(s => s.id !== id);
              saveSales(sales);
              renderTable();
              Toastify({ text: "Vente supprimée", duration:1500, gravity:"top", position:"right", backgroundColor:"#ff6b6b" }).showToast();
            }
          });
        });
      });

      tableBody.querySelectorAll('.edit-btn').forEach(btn=>{
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const sale = sales.find(s => s.id === id);
          if (!sale) return;
          Swal.fire({
            title: 'Modifier Vente',
            html: `
              <input id="editProd" class="swal2-input" value="${escapeHtml(sale.product)}" placeholder="Produit">
              <input id="editSeller" class="swal2-input" value="${escapeHtml(sale.seller)}" placeholder="Vendeur">
              <input id="editQty" class="swal2-input" type="number" value="${sale.quantity}" placeholder="Quantité">
              <input id="editPrice" class="swal2-input" type="number" value="${sale.price}" placeholder="Prix Unitaire">
            `,
            confirmButtonText: 'Enregistrer',
            showCancelButton: true
          }).then(res =>{
            if (res.isConfirmed){
              sale.product = document.getElementById('editProd').value.trim();
              sale.seller = document.getElementById('editSeller').value.trim();
              sale.quantity = Number(document.getElementById('editQty').value);
              sale.price = Number(document.getElementById('editPrice').value);
              if (sale.product && sale.seller && sale.quantity > 0 && sale.price > 0) {
                saveSales(sales);
                renderTable();
                Toastify({ text: "Vente modifiée ✓", duration:1500, gravity:"top", position:"right", backgroundColor:"#5aaef0" }).showToast();
              } else Swal.fire('Erreur','Veuillez remplir correctement','error');
            }
          });
        });
      });
    }

    tableSearch && tableSearch.addEventListener('input', () => { currentPage = 1; renderTable(); });
    prevPage && prevPage.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderTable(); });
    nextPage && nextPage.addEventListener('click', () => { currentPage += 1; renderTable(); });

    renderTable();

    window.addEventListener('storage', e => { if (e.key === 'sales_v1'){ sales = loadSales(); renderTable(); } });
  }

  (function feedbackInit(){
    const feedbackBtn = document.getElementById('feedbackBtn');
    const feedbackModal = document.getElementById('feedbackModal');
    const closeBtn = document.getElementsByClassName('close')[0];
    const submitFeedback = document.getElementById('submitFeedback');
    const feedbackText = document.getElementById('feedbackText');

    feedbackBtn && feedbackBtn.addEventListener('click', () => { feedbackModal && (feedbackModal.style.display = 'block'); });
    closeBtn && closeBtn.addEventListener('click', () => { feedbackModal && (feedbackModal.style.display = 'none'); });
    window.addEventListener('click', (event) => { if (event.target == feedbackModal) feedbackModal.style.display = 'none'; });
    submitFeedback && submitFeedback.addEventListener('click', () => {
      const t = feedbackText && feedbackText.value.trim();
      if (t){ console.log('Feedback:', t); Swal.fire('Merci!', 'Votre feedback a été envoyé.', 'success'); feedbackModal.style.display = 'none'; if (feedbackText) feedbackText.value=''; }
      else Swal.fire('Erreur', 'Veuillez entrer du texte.', 'error');
    });
  })();

})();
