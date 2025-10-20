# scraper.py
import requests
import json
import os

def carregar_token():
    if os.path.exists("token.json"):
        with open("token.json", "r") as f:
            return json.load(f)["token"]
    else:
        raise Exception("Token não encontrado! Execute 'token.py' primeiro.")

def coletar_dados_fii(ticker):
    token = carregar_token()
    url = f"https://investidor10.com.br/api/fii/{ticker}/"
    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0"
    }

    resp = requests.get(url, headers=headers)
    if resp.status_code == 200:
        return resp.json()
    else:
        print(f"Erro ao acessar {ticker}: {resp.status_code}")
        return None
