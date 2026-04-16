/**
 * /api/create-pix - Otimizado
 * Handler de criação de transação PIX via FreePay
 * - Timeout de 10 segundos
 * - Logging reduzido
 * - Resposta mais rápida
 */
module.exports = async function (req, res) {
  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true });
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const body = req.body || {};

    // ── Credenciais ──────────────────────────────────────────────────────────
    const publicKey = process.env.FREEPAY_PUBLIC_KEY
      || process.env.PUBLIC_KEY
      || process.env.FREEPAY_API_PUBLIC_KEY;
    const secretKey = process.env.FREEPAY_SECRET_KEY
      || process.env.SECRET_KEY
      || process.env.FREEPAY_API_SECRET_KEY;

    if (!publicKey || !secretKey) {
      console.error('[create-pix] Chaves FreePay ausentes');
      return res.status(500).json({
        error: 'freepay_keys_missing',
        message: 'Configure FREEPAY_PUBLIC_KEY e FREEPAY_SECRET_KEY nas variáveis de ambiente.'
      });
    }

    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    // ── Postback URL ─────────────────────────────────────────────────────────
    const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const autoPostbackUrl = host ? `${forwardedProto}://${host}/api/freepay-webhook` : null;
    const postbackUrl = process.env.FREEPAY_POSTBACK_URL || autoPostbackUrl;

    if (!postbackUrl) {
      console.error('[create-pix] postback_url não pôde ser determinado');
      return res.status(500).json({
        error: 'freepay_postback_missing',
        message: 'Configure FREEPAY_POSTBACK_URL nas variáveis de ambiente.'
      });
    }

    // ── Normalização do valor (centavos inteiro) ──────────────────────────────
    const parseMoneyToCents = (v) => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 100);
      if (typeof v === 'string') {
        const cleaned = v.replace(/[^0-9,.]/g, '').replace(',', '.');
        const parsed = Number(cleaned);
        if (!Number.isNaN(parsed) && parsed > 0) return Math.round(parsed * 100);
      }
      return null;
    };

    // ── Cálculo do amount ─────────────────────────────────────────────────────
    let amountCents = null;

    if (Array.isArray(body.items) && body.items.length > 0) {
      let sum = 0;
      for (const it of body.items) {
        const unitCents = parseMoneyToCents(it.unit_price) || 0;
        const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
        sum += unitCents * qty;
      }
      if (sum > 0) amountCents = sum;
    }

    if (!amountCents) {
      amountCents = parseMoneyToCents(body.amount)
        || parseMoneyToCents(body.total)
        || parseMoneyToCents(body.valor)
        || parseMoneyToCents(body.value);
    }

    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({
        error: 'invalid_amount',
        message: 'Valor do pagamento inválido ou ausente.'
      });
    }

    // ── Normalização do customer ──────────────────────────────────────────────
    if (!body.customer) {
      return res.status(400).json({
        error: 'customer_missing',
        message: 'Dados do cliente são obrigatórios.'
      });
    }

    const rawDoc = String(body.customer.document || body.customer.cpf || '').replace(/\D/g, '');
    const rawPhone = String(body.customer.phone || '').replace(/\D/g, '');

    let formattedPhone = rawPhone;
    if (formattedPhone && !formattedPhone.startsWith('55')) {
      formattedPhone = '55' + formattedPhone;
    }
    if (formattedPhone && !formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }
    if (!formattedPhone || formattedPhone.length < 10) {
      formattedPhone = '+5511999999999';
    }

    const customer = {
      name: String(body.customer.name || 'Cliente').trim(),
      email: String(body.customer.email || 'cliente@example.com').trim(),
      phone: formattedPhone,
      document: {
        type: rawDoc.length === 14 ? 'cnpj' : 'cpf',
        number: rawDoc || '00000000000'
      }
    };

    // ── Normalização dos itens ────────────────────────────────────────────────
    let items = [];
    if (Array.isArray(body.items) && body.items.length > 0) {
      items = body.items.map(it => ({
        title: String(it.name || it.title || 'Produto').substring(0, 100),
        quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
        unit_price: parseMoneyToCents(it.unit_price) || amountCents,
        tangible: it.tangible !== false
      }));
    } else {
      items = [{
        title: String(body.productName || body.name || 'Produto').substring(0, 100),
        quantity: 1,
        unit_price: amountCents,
        tangible: true
      }];
    }

    // ── Montagem do payload FreePay ───────────────────────────────────────────
    const metadata = {
      checkout_id: `checkout_${Date.now()}`,
      items_count: items.length,
      customer_name: customer.name
    };

    const fpPayload = {
      payment_method: 'pix',
      amount: amountCents,
      postback_url: postbackUrl,
      customer,
      items,
      metadata
    };

    // ── Chamada à API FreePay com timeout ──────────────────────────────────────
    const _fetch = (typeof fetch !== 'undefined') ? fetch
      : (global && global.fetch) ? global.fetch
      : null;

    if (!_fetch) {
      console.error('[create-pix] fetch não disponível');
      return res.status(500).json({ error: 'fetch_unavailable' });
    }

    // Usar AbortController com timeout de 10 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let fpResp;
    try {
      fpResp = await _fetch('https://api.freepaybrasil.com/v1/payment-transaction/create', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(fpPayload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const rawText = await fpResp.text();
    let fpJson;
    try {
      fpJson = JSON.parse(rawText);
    } catch (e) {
      fpJson = { raw: rawText };
    }

    // ── Erro da FreePay ───────────────────────────────────────────────────────
    if (fpResp.status >= 400) {
      console.error('[create-pix] Erro FreePay:', fpResp.status);
      return res.status(fpResp.status).json({
        error: 'freepay_error',
        message: fpJson.message || fpJson.error || 'Erro ao criar transação PIX.',
        detail: fpJson
      });
    }

    // ── Normalização da resposta para o frontend ──────────────────────────────
    const dataArr = Array.isArray(fpJson.data) ? fpJson.data : (fpJson.data ? [fpJson.data] : []);
    const txData = dataArr.length > 0 ? dataArr[0] : (fpJson || {});
    const pixObj = (txData && txData.pix) ? txData.pix : {};

    const pixCode = pixObj.qr_code
      || pixObj.qrcode
      || pixObj.code
      || pixObj.payload
      || txData.qr_code
      || fpJson.qr_code
      || null;

    const pixQrImageUrl = pixObj.url
      || txData.qr_code_url
      || fpJson.qr_code_url
      || null;

    const transactionId = (txData && txData.id) ? txData.id : (fpJson.id || null);
    const calculatedAmount = (txData && txData.amount != null) ? txData.amount : amountCents;
    const expirationDate = pixObj.expiration_date || null;
    const e2e = pixObj.e2_e || null;
    const status = (txData && txData.status) ? txData.status : 'PENDING';

    // Resposta normalizada para o frontend
    const normalizedResponse = {
      ...fpJson,
      pixCode,
      pix_code: pixCode,
      pixQrImageUrl,
      transactionId,
      calculatedAmount,
      expirationDate,
      e2e,
      status,
      data: dataArr.length > 0
        ? dataArr.map((item, idx) => idx === 0 ? {
            ...item,
            pixCode,
            pix_code: pixCode,
            pixQrImageUrl,
            transactionId: item.id || transactionId
          } : item)
        : [{
            pixCode,
            pix_code: pixCode,
            pixQrImageUrl,
            transactionId,
            calculatedAmount,
            status
          }]
    };

    return res.status(200).json(normalizedResponse);

  } catch (err) {
    console.error('[create-pix] erro:', err.message);
    return res.status(500).json({ error: 'internal_error', detail: String(err.message) });
  }
};
