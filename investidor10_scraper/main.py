# main.py
from scraper import coletar_dados_fii

tickers = ["MXRF11", "RZAK11", "HGCR11"]

for t in tickers:
    dados = coletar_dados_fii(t)
    if dados:
        print(f"✅ {t} coletado com sucesso!")
