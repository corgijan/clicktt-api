from flask import Flask, request, jsonify
from templates import tmp_form, tmp_base
import requests
from bs4 import BeautifulSoup
import random
import json
from typing import Dict
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
app = Flask(__name__)

options = webdriver.ChromeOptions()
options.add_argument('--headless')  # Run in headless mode for performance
driver = webdriver.Chrome(options=options)


def parse_tt_to_result(url: str) -> Dict[str, str]:
    # Set up Selenium WebDriver (e.g., using ChromeDriver)
    # Navigate to the URL
    try:
        driver.get(url)

        # Wait until the desired element is present
        wait = WebDriverWait(driver, 10)
        meeting_div = wait.until(EC.presence_of_element_located((By.ID, 'currentCalculatedTotalScore')))
        # Extract the scores
        print()
        scores = meeting_div.get_attribute('innerHTML').split(':')
        heim = scores[0].strip()
        gast = scores[1].strip()

        return {"heim": heim, "gast": gast}
    except Exception as e:
        print(f"Error parsing TT: {str(e)}")
        return {"error": "error parsing TT"}


@app.route("/parse", methods=["GET"])
def parse():
    url = request.args.get('tt-url', default="", type=str)
    if url == "":
        return {"error": "no url given, get param with tt-url as key expected"}

    return {"result": parse_tt_to_result(url)}

@app.route("/")
def hello_world():
    url = request.args.get('tt-url', default="", type=str)
    if url == "":
        return tmp_base(tmp_form)

    result = parse_tt_to_result(url)
    content = f"""
        <div class="center" id="score-container">
            <span style="padding:5px;display:inline-block;" id="heim">HEIM: {result["heim"]}</span>
            <span style="padding:5px;display:inline-block;" id="gast">GAST: {result["gast"]}</span>
        </div>
        <script>
            const url = "{url}";
            async function fetchScores() {{
                const response = await fetch(`/parse?tt-url=${{url}}`);
                const data = await response.json();
                if (data.result) {{
                    document.getElementById('heim').innerText = `HEIM: ${{data.result.heim}}`;
                    document.getElementById('gast').innerText = `GAST: ${{data.result.gast}}`;
                }}
            }}
            
            let time_in_seconds = 20;

            setInterval(fetchScores, time_in_seconds*1000);
        </script>
    """
    return tmp_base(content)