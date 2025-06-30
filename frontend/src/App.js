import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

// Habilita el envío de cookies (para la sesión de login) en todas las peticiones
axios.defaults.withCredentials = true;

// --- Componente LoginForm ---
function LoginForm({ onLoginSuccess, authError, setAuthError }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (event) => {
    event.preventDefault(); setLoading(true); setAuthError('');
    // La ruta '/api' será gestionada por el proxy de Easypanel
    try { const response = await axios.post(`/api/login`, { username, password }); onLoginSuccess(response.data.user); }
    catch (error) { const errorMsg = error.response?.data?.message || 'Error de conexión.'; setAuthError(errorMsg); console.error("Login error:", error); }
    finally { setLoading(false); }
  };
  return ( <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-sky-100 via-sky-50 to-white px-4 text-gray-800"> <div className="w-full max-w-md p-8 space-y-8 bg-white/90 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-200"> <h2 className="text-3xl font-bold text-center text-sky-700">Acceso Extractor OCR</h2> {authError && <p className="text-center text-red-600 mt-4 font-semibold">{authError}</p>} <form className="mt-8 space-y-6" onSubmit={handleSubmit}> <div><input id="username" placeholder="Usuario" required className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10 sm:text-sm rounded-t-md" value={username} onChange={(e) => setUsername(e.target.value)} /></div> <div><input id="password" type="password" placeholder="Contraseña" required className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10 sm:text-sm rounded-b-md" value={password} onChange={(e) => setPassword(e.target.value)} /></div> <div><button type="submit" disabled={loading} className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50">{loading ? 'Ingresando...' : 'Ingresar'}</button></div> </form> </div> <p className="mt-4 text-xs text-gray-500">Usuarios: Hardcore / Admin </p> </div> );
}

// --- Componente Visualización Estructurada Editable ---
function RenderStructuredData({ data, onEdit }) {
    if (!data) return null;
    const handleInputChange = (event, path) => { onEdit(path, event.target.value); };
    const handleTableInputChange = (event, rowIndex, field) => { onEdit(`articulos[${rowIndex}].${field}`, event.target.value); };
    const renderField = (obj, key, path) => {
        const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const currentValue = obj[key] ?? '';
        const currentPath = `${path}.${key}`;
        return ( <div key={currentPath} className="py-2 grid grid-cols-3 gap-4 items-center"> <dt className="text-sm font-medium text-gray-600 col-span-1">{formattedKey}</dt> <dd className="mt-1 text-sm text-gray-900 col-span-2"><input type="text" name={currentPath} value={currentValue} onChange={(e) => handleInputChange(e, currentPath)} className="w-full p-1 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 text-sm" /></dd> </div> );
    };
    const renderSection = (title, sectionData, pathPrefix) => {
        if (!sectionData || typeof sectionData !== 'object') return null;
        return ( <div className="mb-6 bg-white p-4 rounded-lg shadow border border-gray-200"> <h4 className="text-lg font-semibold text-sky-700 mb-2 border-b border-gray-200 pb-1">{title}</h4> <dl>{Object.entries(sectionData).map(([key, value]) => renderField(sectionData, key, pathPrefix))}</dl> </div> );
    };
    const renderArticulosTable = (articulos) => {
        if (!Array.isArray(articulos) || articulos.length === 0) return <p className="text-sm text-gray-500 italic">No se encontraron artículos.</p>;
        const headers = Array.from(new Set(articulos.flatMap(item => Object.keys(item))));
        return ( <div className="overflow-x-auto relative shadow-md sm:rounded-lg border border-gray-200"> <table className="w-full text-sm text-left text-gray-600"> <thead className="text-xs text-gray-700 uppercase bg-gray-100"> <tr> {headers.map(h => <th key={h} scope="col" className="py-3 px-2">{h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>)} </tr> </thead> <tbody> {articulos.map((item, index) => ( <tr key={index} className="bg-white border-b hover:bg-gray-50"> {headers.map(header => ( <td key={`${index}-${header}`} className="py-1 px-1"><input type="text" name={`articulos[${index}].${header}`} value={item[header] ?? ''} onChange={(e) => handleTableInputChange(e, index, header)} className="w-full p-1 border border-gray-300 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 text-xs" /></td> ))} </tr> ))} </tbody> </table> </div> );
    };
    return ( <div className="space-y-4"> {renderSection("Empresa", data.empresa, "empresa")} {renderSection("Cliente", data.cliente, "cliente")} {renderSection("Factura", data.factura, "factura")} <div className="mb-6 bg-white p-4 rounded-lg shadow border border-gray-200"> <h4 className="text-lg font-semibold text-sky-700 mb-2 border-b border-gray-200 pb-1">Artículos</h4> {renderArticulosTable(data.articulos)} <p className="text-xs text-gray-500 mt-1">Nota: No se puede añadir/eliminar filas.</p> </div> {renderSection("Totales", data.totales, "totales")} </div> );
}

// --- Componente MainApp ---
function MainApp({ user, onLogout }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [structuredData, setStructuredData] = useState(null);
  const [error, setError] = useState('');
  const [errorAi, setErrorAi] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const resultsRef = useRef(null);
  const scrollToResults = () => { resultsRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { if (structuredData) { setTimeout(scrollToResults, 100); } }, [structuredData]);
  const handleFileChange = (event) => { processFile(event.target.files?.[0]); };
  const processFile = (file) => {
     if (file?.type === "application/pdf") { setSelectedFile(file); setMessage(''); setStructuredData(null); setError(''); setErrorAi(''); }
     else if (file) { setSelectedFile(null); setError('Por favor, selecciona un archivo PDF.'); }
  }
  const handleUpload = async () => {
    if (!selectedFile) { setError('Por favor, selecciona un archivo.'); return; }
    setUploading(true); setMessage('Iniciando proceso (OCR + IA)...'); setError(''); setErrorAi(''); setStructuredData(null);
    const formData = new FormData(); formData.append('file', selectedFile);
    try {
      const response = await axios.post(`/api/process_invoice`, formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 });
      setMessage(response.data.message || 'Procesado con éxito.'); setStructuredData(response.data.structured_data || null);
      if(response.data.error_ai) setErrorAi(`Resumen Errores IA: ${response.data.error_ai}`);
    } catch (err) {
      console.error("Error al subir:", err);
      if (err.response?.status === 401) { setError('Sesión inválida o expirada.'); onLogout(false); }
      else { setError(`Error: ${err.response?.data?.error || err.message || 'Fallo inesperado.'}`); }
      setMessage('');
    } finally { setUploading(false); }
  };
  const handleSendToN8n = async () => {
      if (!structuredData) { setError("No hay datos JSON para enviar."); return; }
      setMessage('Enviando datos a n8n...'); setError('');
      try {
          const response = await axios.post(`/api/send_to_n8n`, structuredData);
          setMessage(response.data.message || '¡Datos enviados a n8n!'); setError('');
      } catch (error) { setError(`Error al enviar a n8n: ${error.response?.data?.error || error.message || 'Error.'}`); setMessage(''); }
  };
  const handleDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files?.[0]); }, [processFile]); // eslint-disable-line react-hooks/exhaustive-deps
  const handleLogoutClick = async () => { try { await axios.post(`/api/logout`); onLogout(true); } catch (error) { setError("Error al cerrar sesión."); onLogout(false); } };
  const handleVisualDataEdit = useCallback((path, value) => {
    setStructuredData(prevData => {
        if (!prevData) return null;
        let newData = JSON.parse(JSON.stringify(prevData));
        let current = newData;
        const arrayMatch = path.match(/(\w+)\[(\d+)\]\.(\w+)/);
        try {
             if (arrayMatch) {
                 const [, arrayKey, indexStr, fieldKey] = arrayMatch; const index = parseInt(indexStr, 10);
                 if (current[arrayKey]?.[index] !== undefined) {
                     const numFields = ['cantidad', 'precio', 'importe', 'base_imponible', 'iva_porcentaje', 'iva_total', 'total_factura'];
                     if (numFields.includes(fieldKey)) { const numValue = parseFloat(String(value).replace(',', '.')); current[arrayKey][index][fieldKey] = isNaN(numValue) ? value : numValue;
                     } else { current[arrayKey][index][fieldKey] = value; }
                 }
             } else {
                 const keys = path.split('.');
                 const finalKey = keys.pop();
                 keys.forEach(key => { if (current[key] === undefined || current[key] === null) current[key] = {}; current = current[key]; });
                 const totalNumFields = ['base_imponible', 'iva_porcentaje', 'iva_total', 'total_factura'];
                 if (path.startsWith('totales.') && totalNumFields.includes(finalKey)) { const numValue = parseFloat(String(value).replace(',', '.')); current[finalKey] = isNaN(numValue) ? value : numValue;
                 } else { current[finalKey] = value; }
             }
             return newData;
        } catch (e) { console.error("Error actualizando estado:", e); setError("Error al actualizar datos."); return prevData; }
    });
  }, []);
  return (
    <div className="min-h-screen bg-sky-50 text-gray-800 flex flex-col items-center py-6 sm:py-10 px-4">
       <div className="w-full max-w-6xl flex justify-between items-center mb-6 sm:mb-8 px-2 sm:px-4"> <span className="text-xs sm:text-sm text-sky-700">Usuario: {user?.name || 'Desconocido'}</span> <button onClick={handleLogoutClick} className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 sm:mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>Salir</button> </div>
       <div className="w-full max-w-4xl bg-white shadow-xl rounded-lg p-6 sm:p-8 border border-gray-200">
         <div className="flex flex-col items-center mb-8"> <img src="/Logo_temporal-removebg-preview.png" alt="Logo de la Aplicación" className="h-20 w-auto mb-2" onError={(e) => { e.target.style.display='none'; }}/> <h2 className="mt-2 text-center text-sm sm:text-md text-gray-600">Extractor de Facturas</h2> </div>
         <div className={`mb-6 p-6 border-2 ${isDragging ? 'border-sky-500 bg-sky-100' : 'border-dashed border-gray-300'} rounded-md bg-gray-50 transition-all duration-300`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
           <div className="text-center"> <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> <p className="mt-2 text-sm text-gray-600">Arrastra y suelta un archivo PDF aquí</p> <p className="text-xs text-gray-500 mt-1">o</p> <label htmlFor="file-upload" className={`relative mt-2 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-sky-500 ${uploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}><span>Seleccionar Archivo</span><input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".pdf" onChange={handleFileChange} disabled={uploading}/></label> {selectedFile && !uploading && <p className="text-sm font-medium text-green-600 mt-3">Archivo: {selectedFile.name}</p>} </div>
           <button onClick={handleUpload} disabled={uploading || !selectedFile} className={`mt-5 w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white transition-all duration-300 ease-in-out ${ uploading || !selectedFile ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transform hover:scale-105'}`}> {uploading ? 'Procesando...' : 'Subir y Extraer Datos'} </button>
         </div>
         {message && !error && <p className="text-center text-green-600 mb-4 font-semibold">{message}</p>}
         {error && <p className="text-center text-red-600 mb-4 font-semibold">{error}</p>}
         {errorAi && <p className="text-center text-orange-600 mb-4 font-semibold">{errorAi}</p>}
         <div ref={resultsRef} className="mt-8 pt-6 border-t border-gray-200">
           {structuredData && ( <> <h2 className="text-xl font-semibold text-gray-800 mb-4 text-center">Resultados (Editables)</h2> <div className="flex justify-center items-center gap-4 mb-6"> <button onClick={handleSendToN8n} title="Enviar datos editados al webhook de n8n" disabled={!structuredData} className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 ${!structuredData ? 'bg-gray-400 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700'}`}>Enviar a n8n</button> </div> <div className="mt-4 space-y-6"> <RenderStructuredData data={structuredData} onEdit={handleVisualDataEdit} /> </div> </> )}
        </div>
      </div>
    </div>
  );
}

// --- Componente Principal App ---
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    const checkAuthentication = async () => {
      try { const response = await axios.get(`/api/check_auth`);
        if (response.data.isAuthenticated) { setIsAuthenticated(true); setUser(response.data.user); }
        else { setIsAuthenticated(false); setUser(null); }
      } catch (error) { setIsAuthenticated(false); setUser(null); }
      finally { setLoadingAuth(false); }
    };
    checkAuthentication();
  }, []);
  const handleLoginSuccess = (userData) => { setIsAuthenticated(true); setUser(userData); setAuthError(''); };
  const handleLogout = (isUserInitiated) => {
    setIsAuthenticated(false); setUser(null);
    if (!isUserInitiated) { setAuthError("Sesión inválida o expirada. Por favor, ingresa de nuevo."); }
  };
  if (loadingAuth) { return <div className="flex items-center justify-center min-h-screen">Cargando...</div>; }
  return ( <> {!isAuthenticated ? ( <LoginForm onLoginSuccess={handleLoginSuccess} authError={authError} setAuthError={setAuthError} /> ) : ( <MainApp user={user} onLogout={handleLogout} /> )} </> );
}

export default App;
