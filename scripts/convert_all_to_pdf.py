# -*- coding: utf-8 -*-
import os
import re
import subprocess
import html

DOCS = [
    ("01_AUDIT_PORTAIL_AGENT_EXISTANT.md", "01_AUDIT_PORTAIL_AGENT_EXISTANT.pdf", "Audit Exhaustif du Portail Agent"),
    ("02_ETUDE_METIERS_TRANSPORTS_FRET_SETRAG.md", "02_ETUDE_METIERS_TRANSPORTS_FRET_SETRAG.pdf", "Étude des Transports et du Fret"),
    ("03_CARTOGRAPHIE_ACTEURS_INTERNES_EXTERNES.md", "03_CARTOGRAPHIE_ACTEURS_INTERNES_EXTERNES.pdf", "Cartographie des Acteurs & Parties Prenantes"),
    ("04_ARCHITECTURE_SYSTEME_EXPLOITATION_MODULES.md", "04_ARCHITECTURE_SYSTEME_EXPLOITATION_MODULES.pdf", "Architecture du Système d'Exploitation"),
    ("05_CONFORMITE_OHADA_FISCALITE_DROIT_GABON.md", "05_CONFORMITE_OHADA_FISCALITE_DROIT_GABON.pdf", "Conformité OHADA, Fiscalité & Droit Gabonais"),
    ("06_FEUILLE_DE_ROUTE_ET_PLAN_IMPLEMENTATION.md", "06_FEUILLE_DE_ROUTE_ET_PLAN_IMPLEMENTATION.pdf", "Feuille de Route & Plan d'Implémentation"),
    ("LIVRE_BLANC_SETRAG_SYSTEME_EXPLOITATION_INTEGRE.md", "LIVRE_BLANC_SETRAG_SYSTEME_EXPLOITATION_INTEGRE.pdf", "Livre Blanc — SETRAG Enterprise OS")
]

BASE_DIR = "docs/etude-erp-setrag"
PDF_DIR = os.path.join(BASE_DIR, "pdf")
os.makedirs(PDF_DIR, exist_ok=True)

CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

def md_to_html(md_text, title):
    lines = md_text.splitlines()
    html_lines = []
    in_table = False
    in_code = False
    
    for line in lines:
        if line.startswith("```"):
            if in_code:
                html_lines.append("</pre></div>")
                in_code = False
            else:
                html_lines.append("<div class='code-block'><pre>")
                in_code = True
            continue
        
        if in_code:
            html_lines.append(html.escape(line))
            continue
            
        if line.startswith("|") and "|" in line[1:]:
            if "---" in line:
                continue
            if not in_table:
                html_lines.append("<div class='table-container'><table>")
                in_table = True
                cells = [c.strip() for c in line.strip().split("|")[1:-1]]
                html_lines.append("<thead><tr>" + "".join(f"<th>{parse_inline(c)}</th>" for c in cells) + "</tr></thead><tbody>")
            else:
                cells = [c.strip() for c in line.strip().split("|")[1:-1]]
                html_lines.append("<tr>" + "".join(f"<td>{parse_inline(c)}</td>" for c in cells) + "</tr>")
            continue
        else:
            if in_table:
                html_lines.append("</tbody></table></div>")
                in_table = False
                
        if line.startswith("# "):
            html_lines.append(f"<h1 class='doc-h1'>{parse_inline(line[2:])}</h1>")
        elif line.startswith("## "):
            html_lines.append(f"<h2 class='doc-h2'>{parse_inline(line[3:])}</h2>")
        elif line.startswith("### "):
            html_lines.append(f"<h3 class='doc-h3'>{parse_inline(line[4:])}</h3>")
        elif line.startswith("#### "):
            html_lines.append(f"<h4 class='doc-h4'>{parse_inline(line[5:])}</h4>")
        elif line.startswith("- "):
            html_lines.append(f"<li class='list-item'>{parse_inline(line[2:])}</li>")
        elif re.match(r"^\d+\.\s", line):
            num, rest = line.split(". ", 1)
            html_lines.append(f"<li class='num-item'><strong>{num}.</strong> {parse_inline(rest)}</li>")
        elif line.startswith("---"):
            html_lines.append("<hr class='doc-hr'/>")
        elif line.strip() == "":
            html_lines.append("<div class='spacer'></div>")
        else:
            html_lines.append(f"<p class='paragraph'>{parse_inline(line)}</p>")
            
    if in_table:
        html_lines.append("</tbody></table></div>")
    if in_code:
        html_lines.append("</pre></div>")
        
    body_content = "\n".join(html_lines)
    
    template = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
  @page {{
    size: A4 portrait;
    margin: 20mm 15mm 20mm 15mm;
    @bottom-right {{
      content: counter(page);
    }}
  }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    line-height: 1.55;
    font-size: 11pt;
    background: #ffffff;
    margin: 0;
    padding: 0;
  }}
  .header-bar {{
    border-bottom: 2px solid #0f2c59;
    padding-bottom: 8px;
    margin-bottom: 25px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }}
  .header-logo {{
    font-size: 16pt;
    font-weight: 800;
    color: #0f2c59;
    letter-spacing: 1px;
  }}
  .header-meta {{
    font-size: 9pt;
    color: #64748b;
    text-align: right;
  }}
  .doc-h1 {{
    color: #0f2c59;
    font-size: 19pt;
    border-bottom: 2px solid #d39e00;
    padding-bottom: 10px;
    margin-top: 15px;
    margin-bottom: 20px;
    font-weight: 700;
  }}
  .doc-h2 {{
    color: #1e3a8a;
    font-size: 14pt;
    margin-top: 25px;
    margin-bottom: 12px;
    font-weight: 700;
    border-left: 4px solid #d39e00;
    padding-left: 10px;
  }}
  .doc-h3 {{
    color: #0f2c59;
    font-size: 12pt;
    margin-top: 18px;
    margin-bottom: 8px;
    font-weight: 600;
  }}
  .doc-h4 {{
    color: #334155;
    font-size: 11pt;
    margin-top: 14px;
    margin-bottom: 6px;
    font-weight: 600;
  }}
  .paragraph {{
    margin: 6px 0;
    text-align: justify;
  }}
  .list-item, .num-item {{
    margin: 4px 0 4px 20px;
  }}
  .doc-hr {{
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 25px 0;
  }}
  .spacer {{
    height: 6px;
  }}
  .table-container {{
    margin: 18px 0;
    overflow-x: auto;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
  }}
  th {{
    background-color: #0f2c59;
    color: #ffffff;
    font-weight: 600;
    text-align: left;
    padding: 8px 10px;
    border: 1px solid #0f2c59;
  }}
  td {{
    padding: 7px 10px;
    border: 1px solid #cbd5e1;
    vertical-align: top;
  }}
  tr:nth-child(even) {{
    background-color: #f8fafc;
  }}
  .code-block {{
    background: #0f172a;
    color: #f1f5f9;
    padding: 12px 16px;
    border-radius: 6px;
    font-family: "Courier New", Courier, monospace;
    font-size: 8.5pt;
    margin: 15px 0;
    overflow-x: auto;
    border-left: 4px solid #d39e00;
  }}
  pre {{
    margin: 0;
    white-space: pre-wrap;
  }}
  strong {{
    color: #0f172a;
  }}
  .footer {{
    margin-top: 40px;
    border-top: 1px solid #cbd5e1;
    padding-top: 10px;
    font-size: 8pt;
    color: #64748b;
    display: flex;
    justify-content: space-between;
  }}
</style>
</head>
<body>
  <div class="header-bar">
    <div class="header-logo">SETRAG · TRANSGABONAIS</div>
    <div class="header-meta">
      <strong>RÉPUBLIQUE GABONAISE</strong><br>
      Direction des Systèmes d'Information & Projets Métiers
    </div>
  </div>
  
  {body_content}
  
  <div class="footer">
    <div>Projet : SETRAG Enterprise Operating System — Document Officiel d'Ingénierie</div>
    <div>Confidentiel · Tous droits réservés OkaTech / SETRAG 2026</div>
  </div>
</body>
</html>
"""
    return template

def parse_inline(text):
    text = re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.*?)\*", r"<em>\1</em>", text)
    text = re.sub(r"`(.*?)`", r"<code style='background:#f1f5f9;padding:2px 4px;border-radius:3px;font-size:9pt;'>\1</code>", text)
    text = re.sub(r"\[(.*?)\]\((.*?)\)", r"<a href='\2' style='color:#1e3a8a;'>\1</a>", text)
    return text

for md_name, pdf_name, title in DOCS:
    md_path = os.path.join(BASE_DIR, md_name)
    pdf_path = os.path.join(PDF_DIR, pdf_name)
    html_temp = os.path.join(PDF_DIR, f"{os.path.splitext(pdf_name)[0]}.html")
    
    if not os.path.exists(md_path):
        print(f"Fichier introuvable : {md_path}")
        continue
        
    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()
        
    html_doc = md_to_html(md_text, title)
    with open(html_temp, "w", encoding="utf-8") as f:
        f.write(html_doc)
        
    abs_html = os.path.abspath(html_temp)
    abs_pdf = os.path.abspath(pdf_path)
    
    cmd = [
        CHROME_PATH,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--print-to-pdf=" + abs_pdf,
        "--virtual-time-budget=2000",
        "file://" + abs_html
    ]
    
    res = subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(abs_pdf):
        size = os.path.getsize(abs_pdf)
        print(f"✓ PDF généré avec succès : {pdf_name} ({size // 1024} Ko)")
    else:
        print(f"✗ Erreur génération PDF {pdf_name} : {res.stderr}")

print("Traitement de génération PDF terminé.")
