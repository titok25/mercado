// ─────────────────────────────────────────────────────────────────────────────
// checkout-optimized.js - Versão otimizada para performance
// ─────────────────────────────────────────────────────────────────────────────

const Checkout = (() => {
  const stateKey = 'ml_checkout_state';
  let _cachedState = null; // Cache em memória
  let _addressCache = {}; // Cache de endereços ViaCEP

  return {
    stateKey,

    getState() {
      // Usar cache em memória se disponível
      if (_cachedState) return _cachedState;
      
      const saved = localStorage.getItem(stateKey);
      if (saved) {
        try {
          _cachedState = JSON.parse(saved);
          return _cachedState;
        } catch (e) {
          console.error('[Checkout] Erro ao parsear estado:', e);
        }
      }
      
      _cachedState = {
        productName: '',
        amount: 0,
        productImg: '',
        items: [],
        customer: {
          name: '', email: '', phone: '', cpf: '',
          zipcode: '', address: '', number: '', neighborhood: '',
          city: '', state: '', shipping_method: 'Chegará amanhã - Grátis'
        },
        pixCode: '', transactionId: ''
      };
      return _cachedState;
    },

    saveState(state) {
      _cachedState = state; // Atualizar cache
      localStorage.setItem(stateKey, JSON.stringify(state));
    },

    updateCustomer(data) {
      const state = this.getState();
      state.customer = { ...state.customer, ...data };
      this.saveState(state);
    },

    formatCurrency(v) {
      return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },

    renderSummary() {
      const state = this.getState();
      const els = {
        subtotal: document.getElementById('ml-sum-subtotal'),
        total: document.getElementById('ml-sum-total'),
        name: document.getElementById('ml-sum-product-name'),
        img: document.getElementById('ml-sum-product-img'),
        price: document.getElementById('ml-sum-item-price')
      };

      if (els.subtotal) els.subtotal.textContent = this.formatCurrency(state.amount);
      if (els.total) els.total.textContent = this.formatCurrency(state.amount);
      if (els.name) els.name.textContent = state.productName;
      if (els.price) els.price.textContent = this.formatCurrency(state.amount);
      if (els.img && state.productImg) {
        let src = state.productImg;
        if (!src.startsWith('http')) {
          if (!src.startsWith('../')) {
            src = '../' + src.replace(/^(\.\.\/)+/, '');
          }
        }
        els.img.src = src;
      }
    },

    renderSummarySimple() {
      const state = this.getState();
      const els = {
        subtotal: document.getElementById('ml-sum-subtotal'),
        total: document.getElementById('ml-sum-total'),
        name: document.getElementById('ml-sum-product-name')
      };

      if (els.subtotal) els.subtotal.textContent = this.formatCurrency(state.amount);
      if (els.total) els.total.textContent = this.formatCurrency(state.amount);
      if (els.name) els.name.textContent = state.productName;
    },

    renderStepSummaries(currentStep) {
      this.renderSummary();
      const state = this.getState();
      
      if (currentStep > 1) {
        const el = document.getElementById('ml-step-summary-1');
        if (el) el.innerHTML = `<div class="ml-step-summary"><div class="ml-step-summary-data"><b>${state.customer.name}</b><span>${state.customer.email} • ${state.customer.phone}</span></div><a href="identificacao.html" class="ml-card-edit">Alterar</a></div>`;
      }
      if (currentStep > 2) {
        const el = document.getElementById('ml-step-summary-2');
        if (el) el.innerHTML = `<div class="ml-step-summary"><div class="ml-step-summary-data"><b>${state.customer.address}, ${state.customer.number}</b><span>${state.customer.neighborhood}, ${state.customer.city} - ${state.customer.state}</span></div><a href="entrega.html" class="ml-card-edit">Alterar</a></div>`;
      }
      if (currentStep > 3) {
        const el = document.getElementById('ml-step-summary-3');
        if (el) el.innerHTML = `<div class="ml-step-summary"><div class="ml-step-summary-data"><b>${state.customer.shipping_method}</b><span>Entrega Full</span></div><a href="envio.html" class="ml-card-edit">Alterar</a></div>`;
      }
    },

    maskCPF(v) { return v.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').substring(0, 14); },
    maskPhone(v) { 
      v = v.replace(/\D/g, '');
      return v.length > 10 ? v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').substring(0, 15) : v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3').substring(0, 14);
    },
    maskCEP(v) { return v.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2').substring(0, 9); },

    initMasks() {
      const f = (id, mask) => { 
        const el = document.getElementById(id); 
        if (el) el.oninput = (e) => e.target.value = mask(e.target.value); 
      };
      f('ml-input-cpf', this.maskCPF);
      f('ml-input-phone', this.maskPhone);
      f('ml-input-zipcode', (v) => {
        const res = this.maskCEP(v);
        // Fazer fetch apenas quando CEP está completo (9 caracteres)
        if (res.length === 9) {
          const cepClean = res.replace('-', '');
          // Usar cache se disponível
          if (_addressCache[cepClean]) {
            this._fillAddressFields(_addressCache[cepClean]);
          } else {
            this.fetchAddress(cepClean);
          }
        }
        return res;
      });
    },

    fetchAddress(cep) {
      // Usar AbortController com timeout de 3 segundos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal })
        .then(r => r.json())
        .then(d => {
          clearTimeout(timeoutId);
          if (!d.erro) {
            _addressCache[cep] = d; // Cachear resultado
            this._fillAddressFields(d);
          }
        })
        .catch(e => {
          clearTimeout(timeoutId);
          console.warn('[Checkout] Erro ao buscar CEP:', e.message);
        });
    },

    _fillAddressFields(data) {
      const f = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      f('ml-input-address', data.logradouro);
      f('ml-input-neighborhood', data.bairro);
      f('ml-input-city', data.localidade);
      f('ml-input-state', data.uf);
    },

    validateCPF(cpf) {
      cpf = cpf.replace(/\D/g, '');
      if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
      const calc = (slice, factor) => slice.split('').reduce((a, c, i) => a + parseInt(c) * (factor - i), 0) * 10 % 11 % 10;
      return calc(cpf.slice(0, 9), 10) === parseInt(cpf[9]) && calc(cpf.slice(0, 10), 11) === parseInt(cpf[10]);
    }
  };
})();

// Inicializar apenas quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => { 
  Checkout.initMasks(); 
  Checkout.renderSummary(); 
});
