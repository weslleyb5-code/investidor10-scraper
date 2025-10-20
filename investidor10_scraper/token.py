# token.py
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import time

TOKEN_FILE = "token.json"
URL = "https://investidor10.com.br/fiis/busca-avancada/"

def capturar_token():
    """
    Abre o navegador, acessa a página e captura o x-csrf-token
    """
    chrome_options = Options()
    chrome_options.add_argument("--headless")  # roda sem abrir janela (opcional)
    chrome_options.add_argument("--disable-gpu")
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
    
    try:
        driver.get(URL)
        time.sleep(3)  # espera a página carregar e scripts rodarem

        # captura o token do cookie XSRF-TOKEN
        cookies = driver.get_cookies()
        xsrf_cookie = next((c for c in cookies if c["name"] == "XSRF-TOKEN"), None)
        if xsrf_cookie:
            token = xsrf_cookie["value"]
            return token
        else:
            print("Token não encontrado nos cookies.")
            return None
    finally:
        driver.quit()

def salvar_token(token):
    """
    Salva o token em token.json
    """
    with open(TOKEN_FILE, "w") as f:
        json.dump({"x-csrf-token": token}, f)
    print(f"Token salvo em {TOKEN_FILE}")

if __name__ == "__main__":
    token = capturar_token()
    if token:
        print("Token capturado:", token)
        salvar_token(token)
    else:
        print("Falha ao capturar token.")
