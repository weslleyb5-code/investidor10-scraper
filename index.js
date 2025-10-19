import fetch from 'node-fetch';
import { google } from 'googleapis';

const SHEET_ID = process.env.SHEET_ID;
const SHEET_TAB = process.env.SHEET_TAB || 'Investidor10';
const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON;

// Autenticação com Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

// Função principal
async function fetchInvestidor10Data() {
  const url = 'https://investidor10.com.br/fiis/api/filter-funds';
  const body = {
    search: "",
    segment: [],
    administrator: [],
    type: [],
    order: "dy",
    orderType: "desc",
    page: 1,
    size: 1000
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': 'https://investidor10.com.br/fiis/busca-avancada/',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar dados: ${response.status}`);
  }

  const data = await response.json();

  if (!data?.data?.length) {
    throw new Error('Nenhum dado retornado pela API.');
  }

  // Cabeçalhos
  const headers = [
    'Código', 'Nome', 'Segmento', 'DY', 'P/VP', 'Preço Atual',
    'Valor Patrimonial', 'Liquidez Diária', 'Vacância', 'Último Rendimento'
  ];

  const rows = data.data.map(item => [
    item.ticker,
    item.name,
    item.segment,
    item.dy,
    item.p_vp,
    item.price,
    item.patrimonial_value,
    item.liquidez_media_diaria,
    item.vacancia,
    item.ultimo_rendimento
  ]);

  // Escreve na planilha
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers, ...rows] }
  });

  console.log(`✅ Dados atualizados com sucesso (${rows.length} FIIs).`);
}

// Executa
fetchInvestidor10Data().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
