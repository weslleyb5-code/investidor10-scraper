# token.py
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time
import json

def capturar_token():
    url = "https://investidor10.com.br/"
    
    # Configura o navegador
    options = Options()
    options.add_argument("--headless")
    driver = webdriver.Chrome(options=options)
    driver.get(url)

    # Espera o site carregar
    time.sleep(5)

    # Executa JavaScript para pegar o token do localStorage
    token = driver.execute_script("return window.localStorage.getItem('token');")
    driver.quit()

    if token:
        with open("token.json", "w") as f:
            json.dump({"token": token}, f)
        print("✅ Token capturado e salvo!")
    else:
        print("⚠️ Nenhum token encontrado. Verifique se o site exige login manual.")

if __name__ == "__main__":
    capturar_token()
