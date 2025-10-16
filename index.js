/**
 * investidor10-scraper
 * - Playwright + Google Sheets
 * - Lê https://investidor10.com.br/fiis/ e grava na aba definida por SHEET_TAB
 *
 * Secrets required:
 * - SERVICE_ACCOUNT_JSON  (JSON inteiro da service account)
 * - SHEET_ID              (ID da planilha)
 * - SHEET_TAB             (nome da aba; ex: investidor10)
 */

const { chromium } = require('playwright');
const { google } = require('googleapis');

const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON || '';
const SHEET_ID = process.env.SHEET_ID || '';
const SHEET_TAB = process.env.SHEET_TAB || 'investidor10';
const TARGET_URL = 'https://investidor10.com.br/fiis/';

if (!SERVICE_ACCOUNT_JSON || !SHEET_ID) {
  console.error('ERRO: defina SERVICE_ACCOUNT_JSON e SHEET_ID como secrets/variáveis de ambiente.');
  process.exit(1);
}

/* ====== Helpers ====== */

function parseTableHtmlToArray(tableHtml) {
  if (!tableHtml) return [];
  const rows = [];
  const trRe = /<tr[\s\S]*?<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(tableHtml)) !== null) {
    const trHtml = tr[0];
    const cellRe = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
    const cells = [];
    let cell;
    while ((cell = cellRe.exec(trHtml)) !== null) {
      let inner = cell[2] || '';
      inner = inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      cells.push(inner);
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

async function getSheetsClient() {
  const creds = JSON.parse(SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function ensureSheetTabExists(sheets, tabName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetsMeta = meta.data.sheets || [];
  const found = sheetsMeta.find(s => s.properties && s.properties.title === tabName);
  if (!found) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
    });
  }
}

async function writeToGoogleSheet(values, tabName) {
  const sheets = await getSheetsClient();
  await ensureSheetTabExists(sheets, tabName);

  // normaliza colunas
  let maxCols = 0;
  for (const r of values) if (r && r.length > maxCols) maxCols = r.length;
  const normalized = values.map(r => {
    const row = (r || []).slice();
    while (row.length < maxCols) row.push('');
    return row;
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: normalized }
  });
}

/* ====== Scraper ====== */

async function extractFirstTableHtml(page) {
  try { await page.waitForSelector('table', { timeout: 15000 }); } catch(e) {}
  const tableHtml = await page.$eval('table', t => t.outerHTML).catch(() => null);
  return tableHtml;
}

(async () => {
  console.log('Iniciando Playwright (Investidor10)...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    });
    const page = await context.newPage();

    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // tenta clicar botões se existir (segurança)
    const tryButtons = ['Filtrar','Gerar','Buscar','Pesquisar','Aplicar filtros'];
    for (const t of tryButtons) {
      try {
        const btn = await page.$(`button:has-text("${t}")`);
        if (btn) {
          await btn.click().catch(()=>{});
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(()=>{});
          break;
        }
      } catch(e){}
    }

    const tableHtml = await extractFirstTableHtml(page);
    if (!tableHtml) {
      // imprime um trecho de HTML para debug
      const html = await page.content();
      console.error('Tabela não encontrada. HTML length:', html.length);
      console.error(html.substring(0, 1200));
      process.exit(2);
    }

    const data = parseTableHtmlToArray(tableHtml);
    console.log('Linhas extraídas:', data.length);

    if (data.length === 0) {
      console.error('Parse resultou em 0 linhas.');
      process.exit(3);
    }

    await writeToGoogleSheet(data, SHEET_TAB);
    console.log('Dados gravados na aba:', SHEET_TAB);

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Erro na execução:', err);
    try { await browser.close(); } catch(_){}
    process.exit(4);
  }
})();
