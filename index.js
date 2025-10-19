/**
 * investidor10-scraper (versão busca avançada)
 *
 * - Vai para https://investidor10.com.br/fiis/busca-avancada/
 * - Tenta fechar popups/cookies se aparecerem
 * - Clica no botão "Buscar" (ou "Pesquisar") da busca avançada
 * - Aguarda a tabela de resultados e extrai os dados
 * - Grava na aba definida por SHEET_TAB da planilha (SHEET_ID)
 *
 * Secrets required:
 * - SERVICE_ACCOUNT_JSON
 * - SHEET_ID
 * - SHEET_TAB
 */

const { chromium } = require('playwright');
const { google } = require('googleapis');

const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON || '';
const SHEET_ID = process.env.SHEET_ID || '';
const SHEET_TAB = process.env.SHEET_TAB || 'investidor10';
const ADVANCED_URL = 'https://investidor10.com.br/fiis/busca-avancada/';

if (!SERVICE_ACCOUNT_JSON || !SHEET_ID) {
  console.error('ERRO: defina SERVICE_ACCOUNT_JSON e SHEET_ID como secrets/variáveis de ambiente.');
  process.exit(1);
}

/* ===== Helpers para Sheets ===== */
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

/* ===== Helpers de parsing HTML table ===== */
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

/* ===== extrai a primeira tabela visível ===== */
async function extractFirstTableHtml(page) {
  try {
    // espera por tabela aparecendo (pode demorar um pouco)
    await page.waitForSelector('table', { timeout: 20000 });
  } catch (e) {
    // nada
  }
  // tenta obter a primeira tabela que tenha conteúdo
  const tableHtml = await page.$$eval('table', (tables) => {
    for (const t of tables) {
      try {
        if (t && t.outerHTML && t.innerText && t.innerText.trim().length > 0) {
          return t.outerHTML;
        }
      } catch (e) {}
    }
    return null;
  }).catch(() => null);
  return tableHtml;
}

/* ===== rotina principal ===== */
(async () => {
  console.log('Iniciando Playwright (Investidor10 - busca avançada)...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    });
    const page = await context.newPage();

    // abre a página de busca avançada
    await page.goto(ADVANCED_URL, { waitUntil: 'networkidle', timeout: 60000 });

    // tenta fechar banners/cookies se aparecerem (vários sites têm isso)
    const possibleCloseSelectors = [
      'button[aria-label="close"]',
      'button:has-text("Aceitar")',
      'button:has-text("Aceito")',
      'button:has-text("Entendi")',
      'button:has-text("Fechar")',
      '.cookie-consent button',
      '.accept-cookie'
    ];
    for (const sel of possibleCloseSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click().catch(()=>{});
          await page.waitForTimeout(500).catch(()=>{});
        }
      } catch(e){}
    }

    // tenta localizar e clicar no botão de busca avançada
    // pesquisamos por texto "Buscar" ou "Pesquisar" dentro de botões ou inputs do tipo submit
    let clicked = false;
    const buttonSelectors = [
      'button:has-text("Buscar")',
      'button:has-text("Pesquisar")',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Aplicar filtros")'
    ];
    for (const sel of buttonSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click().catch(()=>{});
          clicked = true;
          // espera a requisição e a tabela carregar
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
          break;
        }
      } catch(e){}
    }

    // se não clicou em nenhum botão, tentar submeter um formulário (caso haja)
    if (!clicked) {
      try {
        const form = await page.$('form');
        if (form) {
          await form.evaluate(f => f.submit());
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
        }
      } catch(e){}
    }

    // aguarda um pouco para a tabela renderizar (algumas páginas usam JS)
    await page.waitForTimeout(1500);

    // extrai a primeira tabela visível
    const tableHtml = await extractFirstTableHtml(page);
    if (!tableHtml) {
      // salva um trecho do HTML no log para debug
      const html = await page.content();
      console.error('Tabela não encontrada. HTML length:', html.length);
      console.error(html.substring(0, 1200));
      process.exit(2);
    }

    // parse e grava na planilha
    const data = parseTableHtmlToArray(tableHtml);
    console.log('Linhas extraídas:', data.length);
    if (!data || data.length === 0) {
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
