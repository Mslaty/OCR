import os, io, logging, re, csv, json, datetime, requests
from flask import Flask, request, jsonify, abort
import pytesseract
from pdf2image import convert_from_bytes
import google.generativeai as genai
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

# --- Configuración ---
app = Flask(__name__)
# ¡IMPORTANTE! Easypanel inyectará esta variable.
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'default-secret-key-change-me')
app.config['SESSION_COOKIE_SECURE'] = True; app.config['SESSION_COOKIE_HTTPONLY'] = True; app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
login_manager = LoginManager(); login_manager.init_app(app); login_manager.login_view = None; login_manager.session_protection = "strong"
logging.basicConfig(level=logging.INFO)
try:
    # Easypanel inyectará estas variables.
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
    if not GEMINI_API_KEY: logging.error("GEMINI_API_KEY no configurada!"); GEMINI_API_KEY = None
    else: genai.configure(api_key=GEMINI_API_KEY); logging.info("Cliente API Gemini configurado.")
except Exception as e: logging.error(f"Error config Gemini: {e}"); GEMINI_API_KEY = None
N8N_WEBHOOK_URL = os.environ.get('N8N_WEBHOOK_URL')
if not N8N_WEBHOOK_URL: logging.error("N8N_WEBHOOK_URL no configurada!"); N8N_WEBHOOK_URL = None

# --- Auth (Usuarios de ejemplo) ---
# ¡¡¡ ATENCIÓN: Esto es para pruebas. En producción, usa una base de datos. !!!
users_db = {
    "Hardcore": { "password_hash": generate_password_hash("Javi69"), "id": "1", "name": "Hardcore User" },
    "Admin": { "password_hash": generate_password_hash("MZK_77"), "id": "2", "name": "Admin MZK" }
}
class User(UserMixin):
    def __init__(self, id, name, password_hash): self.id=id; self.name=name; self.password_hash=password_hash
    @staticmethod
    def get(user_id): return next((User(ud['id'], ud['name'], ud['password_hash']) for u, ud in users_db.items() if ud['id'] == user_id), None)
    @staticmethod
    def get_by_username(uname): ud = users_db.get(uname); return User(ud['id'], ud['name'], ud['password_hash']) if ud else None
@login_manager.user_loader
def load_user(user_id): return User.get(user_id)
@login_manager.unauthorized_handler
def unauthorized(): return jsonify(message="No autorizado."), 401
@app.route('/login', methods=['POST'])
def login():
    if current_user.is_authenticated: return jsonify(message="Ya logueado."), 200
    data = request.get_json(); user = User.get_by_username(data.get('username',''))
    if user and check_password_hash(user.password_hash, data.get('password','')): login_user(user, remember=True); return jsonify(message="Login OK.", user={'id':user.id,'name':user.name}), 200
    else: return jsonify(message="Credenciales inválidas."), 401
@app.route('/logout', methods=['POST'])
@login_required
def logout(): logout_user(); return jsonify(message="Logout OK."), 200
@app.route('/check_auth', methods=['GET'])
def check_auth(): return jsonify(isAuthenticated=current_user.is_authenticated, user={'id':current_user.id,'name':current_user.name} if current_user.is_authenticated else None), 200

# --- Funciones IA y CSV ---
def get_structured_data_from_gemini_page(page_text_content):
    if not GEMINI_API_KEY: return None, "Error: Clave API Gemini no configurada."
    model = genai.GenerativeModel('gemini-1.5-flash-latest')
    prompt = f"""Analiza el texto OCR de UNA PÁGINA de factura. Devuelve **únicamente** un objeto JSON válido que siga **estrictamente** el esquema. **No incluyas NADA más.** Usa comillas dobles (" ") para claves y strings. Usa comas (,) correctamente. Si un campo falta, usa `null`. Extrae solo artículos de esta página. Normaliza fechas a YYYY-MM-DD. Convierte números a tipo number (float/int) usando punto (.) decimal. Verifica la sintaxis JSON. Esquema: {{"empresa":{{"nombre":"string|null","direccion":"string|null","cif":"string|null","email":"string|null","website":"string|null"}},"cliente":{{"nombre":"string|null","direccion":"string|null","nif":"string|null","numero_cliente":"string|null"}},"factura":{{"numero":"string|null","fecha_emision":"string(YYYY-MM-DD)|null","fecha_vencimiento":"string(YYYY-MM-DD)|null","forma_pago":"string|null"}},"articulos":[{{"articulo":"string|null","descripcion":"string|null","cantidad":"number|null","precio":"number|null","importe":"number|null","lote":"string|null","caducidad":"string(YYYY-MM-DD)|null"}}],"totales":{{"base_imponible":"number|null","iva_porcentaje":"number|null","iva_total":"number|null","total_factura":"number|null"}}}} Texto OCR:\n-------------------------\n{page_text_content}\n-------------------------\nJSON extraído:"""
    try:
        app.logger.info("Enviando a Gemini API (página)...")
        safety_settings = [ {"category": genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT, "threshold": genai.types.HarmBlockThreshold.BLOCK_NONE}, {"category": genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH, "threshold": genai.types.HarmBlockThreshold.BLOCK_NONE}, {"category": genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, "threshold": genai.types.HarmBlockThreshold.BLOCK_NONE}, {"category": genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, "threshold": genai.types.HarmBlockThreshold.BLOCK_NONE}, ]
        generation_config = genai.types.GenerationConfig(max_output_tokens=8192, temperature=0.1)
        response = model.generate_content(prompt, generation_config=generation_config, safety_settings=safety_settings)
        raw_response_text = response.text; app.logger.debug(f"Raw Gemini: {raw_response_text}")
        json_str = raw_response_text.strip().removeprefix('```json').removesuffix('```').strip()
        json_str_fixed = re.sub(r"([{,]\s*)'([^']+)':", r'\1"\2":', json_str)
        if json_str_fixed != json_str: app.logger.info("Intentando reparar comillas simples."); json_str = json_str_fixed
        try: return json.loads(json_str), None
        except json.JSONDecodeError as json_err: app.logger.error(f"Error parseando JSON: {json_err}\nTexto: {json_str}"); return None, f"Error parseando JSON IA: {json_err}"
    except Exception as e: app.logger.error(f"Error API Gemini: {e}", exc_info=True); return None, f"Error API IA: {e}"
def merge_page_jsons(page_results):
    if not page_results: return None
    valid_page_data = [pd for pd in page_results if isinstance(pd, dict)];
    if not valid_page_data: return None
    final_data={"empresa":{},"cliente":{},"factura":{},"articulos":[],"totales":{}}
    header_keys=["empresa","cliente","factura"]; total_keys=["totales"]
    for i, page_data in enumerate(valid_page_data):
        if isinstance(page_data.get("articulos"), list): final_data["articulos"].extend(item for item in page_data["articulos"] if isinstance(item, dict))
        for key in header_keys + total_keys:
            if key in page_data and isinstance(page_data[key], dict):
                for sub_key, value in page_data[key].items():
                    if key in header_keys:
                        if final_data[key].get(sub_key) is None and value is not None: final_data[key][sub_key] = value
                    elif key in total_keys:
                         if value is not None: final_data[key][sub_key] = value
    schema_keys={"empresa":["nombre","direccion","cif","email","website"],"cliente":["nombre","direccion","nif","numero_cliente"],"factura":["numero","fecha_emision","fecha_vencimiento","forma_pago"],"totales":["base_imponible","iva_porcentaje","iva_total","total_factura"]}
    for main_key, sub_keys in schema_keys.items():
        if main_key not in final_data: final_data[main_key] = {}
        for sub_key in sub_keys: final_data[main_key].setdefault(sub_key, None)
    if not final_data["articulos"]: app.logger.info("Array final artículos vacío.")
    return final_data
def generate_csv_from_json(structured_data):
    if not structured_data or 'articulos' not in structured_data or not isinstance(structured_data['articulos'], list) or not structured_data['articulos']: return "No hay datos de artículos."
    try:
        output = io.StringIO(); fieldnames = []
        for item in structured_data['articulos']:
             for key in item.keys():
                 if key not in fieldnames: fieldnames.append(key)
        if not fieldnames: return "No se pudieron determinar cabeceras CSV."
        writer = csv.DictWriter(output, fieldnames=fieldnames, quoting=csv.QUOTE_ALL, extrasaction='ignore')
        writer.writeheader(); writer.writerows(structured_data['articulos'])
        csv_content = output.getvalue(); output.close()
        return csv_content
    except Exception as e: app.logger.error(f"Error generando CSV: {e}"); return f"Error CSV: {e}"

# --- Rutas API ---
@app.route('/process_invoice', methods=['POST'])
@login_required
def process_invoice():
    if 'file' not in request.files: return jsonify({"error": "No file part"}), 400
    file = request.files['file']; original_filename = file.filename
    if original_filename == '': return jsonify({"error": "No selected file"}), 400
    if not file or not original_filename.lower().endswith('.pdf'): return jsonify({"error": "Invalid format"}), 400
    app.logger.info(f"Procesando: {original_filename}")
    extracted_text_full = ""; page_results_json = []; error_ai_list = []
    try:
        pdf_bytes = file.read(); app.logger.info(f"Leídos {len(pdf_bytes)} bytes.")
        try:
            images = convert_from_bytes(pdf_bytes, dpi=300, fmt='png'); app.logger.info(f"PDF->{len(images)} imágenes.")
            for i, img in enumerate(images):
                page_num = i + 1; app.logger.info(f"Procesando pág {page_num} OCR...")
                page_text = pytesseract.image_to_string(img, config=r'-l spa --psm 6')
                extracted_text_full += f"--- Página {page_num} ---\n{page_text}\n\n";
                app.logger.info(f"Texto pág {page_num} extraído. Llamando Gemini...")
                structured_page_data, gemini_page_error = get_structured_data_from_gemini_page(page_text)
                if gemini_page_error: error_ai_list.append(f"P{page_num}: {gemini_page_error}")
                page_results_json.append(structured_page_data if structured_page_data else None)
            app.logger.info("OCR/Gemini por página completado.")
        except Exception as ocr_err: app.logger.error(f"Error OCR/Conv: {ocr_err}", exc_info=True); return jsonify({"error": f"Error OCR: {ocr_err}"}), 500
        app.logger.info("Fusionando JSONs..."); final_structured_data = merge_page_jsons(page_results_json)
        if not final_structured_data: app.logger.warning("Fallo al fusionar datos.")
        csv_data = generate_csv_from_json(final_structured_data); app.logger.info(f"CSV generado: {csv_data[:100]}...")
        final_message = "Procesado."; combined_error_ai = "; ".join(error_ai_list) if error_ai_list else None
        if combined_error_ai: final_message = "Procesado con errores IA."
        response_payload = { "message": final_message, "filename": original_filename, "extracted_text": extracted_text_full, "structured_data": final_structured_data, "csv_data": csv_data }
        if combined_error_ai: response_payload["error_ai"] = combined_error_ai
        status_code = 200 if not combined_error_ai else 207
        return jsonify(response_payload), status_code
    except Exception as e: app.logger.error(f"Error general: {e}", exc_info=True); return jsonify({"error": "Error interno servidor."}), 500
@app.route('/send_to_n8n', methods=['POST'])
@login_required
def send_to_n8n_webhook_proxy():
    if not N8N_WEBHOOK_URL: return jsonify({"error": "Webhook no configurado."}), 500
    json_data = request.get_json();
    if not json_data: return jsonify({"error": "No JSON data."}), 400
    app.logger.info(f"Enviando a n8n: {N8N_WEBHOOK_URL}")
    try:
        response = requests.post(N8N_WEBHOOK_URL, json=json_data, timeout=30); response.raise_for_status()
        app.logger.info(f"Respuesta n8n: {response.status_code}")
        try: return jsonify({"message": "Datos enviados.", "n8n_response": response.json()}), 200
        except requests.exceptions.JSONDecodeError: return jsonify({"message": "Datos enviados (resp n8n no JSON)."}), 200
    except requests.exceptions.RequestException as e: app.logger.error(f"Error enviando a n8n: {e}"); return jsonify({"error": f"Error contactando n8n: {e}"}), 503

# Ruta de salud / Health check
@app.route('/')
def index(): return f"Backend OK (Auth: {current_user.name})" if current_user.is_authenticated else "Backend OK (No Auth)"