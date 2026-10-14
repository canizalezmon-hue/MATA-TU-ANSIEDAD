// ==========================================
// 1. Variables Globales, API y Cookies
// ==========================================
let TASA_BCV = 36.50; 
const NUMERO_LIDER_WHATSAPP = "584122317676"; 

// 🔥 API DE GOOGLE SHEETS 🔥
const GOOGLE_SHEETS_API = "https://script.google.com/macros/s/AKfycby-Fdc74UV1FnoemPVOFCw-qeB0a5kI1X57QwQVdzW6wGiYoTWRQvtSZ0IwfeHXxS_H/exec";

let carrito = [];
let usuariosDeLaNube = []; 
let productos = [];
let deudasGlobales = []; 
let pagosGlobales = []; 
let categoriaActual = 'Todas'; 

function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i=0;i < ca.length;i++) {
        let c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}
function eraseCookie(name) { document.cookie = name +'=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'; }

async function enviarDatosGoogle(datos) {
    const formData = new URLSearchParams();
    for (const key in datos) { formData.append(key, datos[key]); }
    try {
        await fetch(GOOGLE_SHEETS_API, { method: 'POST', body: formData, mode: 'no-cors' });
    } catch(e) {
        console.error("Error sincronizando", e);
    }
}

async function respaldarInventarioEnNube() {
    await enviarDatosGoogle({ action: 'sincronizarInventario', datosInventario: JSON.stringify(productos) });
}

let usuarioActivo = getCookie('mta_session_user'); 
let datosUsuario = JSON.parse(getCookie('mta_session_data')) || {};
let correoGuardado = getCookie('mta_remember_email') || ""; 
let passGuardado = getCookie('mta_remember_pass') || ""; 

let modoRegistro = false;
let modoRecuperacion = false; 
let pasoVerificacion = false;
let codigoGeneradoOTP = "";
let datosTemporales = {};
let temporizadorOTP = null;
let productoEnEdicionId = null;

let ordenesGlobales = JSON.parse(localStorage.getItem('mta_global_orders')) || [];
let diasCobroGlobales = JSON.parse(localStorage.getItem('mta_dias_cobro')) || [15, 30]; 
let categoriasMTA = JSON.parse(localStorage.getItem('mta_categorias')) || ['Dulce', 'Salado'];

// ==========================================
// 🔥 NUEVO: FUNCIÓN PARA MOSTRAR ESQUELETOS
// ==========================================
function mostrarEsqueletos() {
    // 1. Mostrar esqueletos para las categorías
    const catContainer = document.getElementById('category-filters');
    if (catContainer) {
        catContainer.innerHTML = `
            <div class="skeleton-btn-load" style="width: 80px; height: 35px; margin-top:0; border-radius: 20px;"></div>
            <div class="skeleton-btn-load" style="width: 100px; height: 35px; margin-top:0; border-radius: 20px;"></div>
            <div class="skeleton-btn-load" style="width: 90px; height: 35px; margin-top:0; border-radius: 20px;"></div>
        `;
    }

    // 2. Mostrar esqueletos de tarjetas (6 tarjetas falsas)
    const grid = document.getElementById('product-grid');
    if (grid) {
        grid.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            grid.innerHTML += `
                <div class="skeleton-card">
                    <div class="skeleton-img"></div>
                    <div class="skeleton-title"></div>
                    <div class="skeleton-price"></div>
                    <div class="skeleton-price" style="width: 30%;"></div>
                    <div class="skeleton-btn-load"></div>
                </div>`;
        }
    }
}

// ==========================================
// 2. Inicialización
// ==========================================
window.onload = async () => {
    // 🔥 CAMBIO: Si el usuario ya está logueado, mostramos los esqueletos y la interfaz inmediatamente 🔥
    if (usuarioActivo) {
        document.getElementById('welcome-screen').style.display = 'none';
        document.getElementById('main-nav').style.display = 'flex';
        document.getElementById('btn-user-dropdown').innerText = `👤 Cargando Perfil... ▼`;
        
        // Si no es el administrador, mostramos la tienda con los esqueletos
        if (usuarioActivo !== 'admin' && usuarioActivo !== 'administrador@matatuansiedad.com') {
            document.getElementById('store-content').style.display = 'block';
            mostrarEsqueletos(); // ¡Aparece la magia de carga rápida!
        } else {
            document.getElementById('admin-page').style.display = 'block';
        }
    }

    // AHORA SÍ, mientras el usuario ve los esqueletos, traemos la data real
    try {
        const urlFresco = GOOGLE_SHEETS_API + "?t=" + new Date().getTime();
        const respuesta = await fetch(urlFresco);
        const dataNube = await respuesta.json();
        
        if(dataNube.inventario && dataNube.inventario.length > 0) {
            let unicos = []; let map = new Map();
            for (let item of dataNube.inventario) { if(!map.has(item.id)){ map.set(item.id, true); unicos.push(item); } }
            productos = unicos; 
        } else { productos = []; }
        
        if(dataNube.clientes) usuariosDeLaNube = dataNube.clientes;
        if(dataNube.deudas) deudasGlobales = dataNube.deudas; 
        if(dataNube.pagos) pagosGlobales = dataNube.pagos; 
        
    } catch(e) {
        console.error("Error crítico al cargar desde Google Drive:", e);
        showToast("⚠️ Problemas de conexión con la base de datos.");
        productos = []; 
    }

    await obtenerTasaBCV(); 
    verificarAlarmaCobro(); 
    verificarExpiracionSesion();

    if (usuarioActivo) {
        let usuarioVerificado = usuariosDeLaNube.find(u => u.correo === usuarioActivo);
        if(usuarioVerificado && usuarioVerificado.estado === 'Bloqueado') {
            showToast(`🚫 TU CUENTA FUE BLOQUEADA.<br>Motivo: ${usuarioVerificado.motivo}`);
            cerrarSesion();
        } else {
            // Ya que llegó la data, ejecutamos la entrada para REEMPLAZAR los esqueletos por la data real
            ejecutarEntrada();
        }
    }
    else {
        document.getElementById('welcome-screen').style.display = 'flex';
        if(correoGuardado) {
            document.getElementById('auth-email').value = correoGuardado; 
            if(passGuardado) {
                document.getElementById('auth-password').value = passGuardado;
                const check = document.getElementById('remember-me');
                if(check) check.checked = true;
            }
        }
    }

    document.getElementById('input-search').addEventListener('input', () => {
        aplicarFiltrosGlobales();
    });
    document.getElementById('chk-metodo').addEventListener('change', renderResumenCheckout);
};

function verificarExpiracionSesion() {
    const sessionTime = getCookie('mta_session_time');
    if (usuarioActivo && sessionTime) {
        if (Date.now() - parseInt(sessionTime) > 18000000) { 
            showToast("⏳ Tu sesión ha expirado por seguridad (5 horas).");
            cerrarSesion();
        }
    }
}

function verificarAlarmaCobro() {
    const diaActual = new Date().getDate();
    if (diasCobroGlobales.includes(diaActual)) {
        document.getElementById('cobro-banner').style.display = 'block';
        document.getElementById('main-nav').style.top = "45px";
        document.getElementById('toast-container').style.top = "100px";
    }
}

async function obtenerTasaBCV() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        TASA_BCV = data.promedio;
        document.getElementById('tasa-bcv-display').innerText = TASA_BCV.toFixed(2);
    } catch (e) { document.getElementById('tasa-bcv-display').innerText = TASA_BCV.toFixed(2) + " (Aprox)"; }
}

function obtenerEmojiCategoria(cat) {
    const c = cat.toLowerCase();
    if(c.includes('dulce') || c.includes('chocolate')) return '🍫';
    if(c.includes('salad') || c.includes('snack') || c.includes('dorito')) return '🍟';
    if(c.includes('galleta')) return '🍪';
    if(c.includes('bebida') || c.includes('jugo') || c.includes('refresco')) return '🥤';
    if(c.includes('postre') || c.includes('torta') || c.includes('cake')) return '🍰';
    if(c.includes('salud') || c.includes('sano')) return '🍎';
    if(c.includes('cafe') || c.includes('café')) return '☕';
    return '🏷️'; 
}

function renderCategorias() {
    const container = document.getElementById('category-filters');
    if(!container) return;
    
    let html = `<button class="cat-btn active" onclick="filtrarPorCategoria('Todas', this)">🍬 Todas</button>`;
    
    categoriasMTA.forEach(cat => {
        let emoji = obtenerEmojiCategoria(cat);
        html += `<button class="cat-btn" onclick="filtrarPorCategoria('${cat}', this)">${emoji} ${cat}</button>`;
    });
    
    container.innerHTML = html;
}

window.filtrarPorCategoria = (cat, btnElement) => {
    categoriaActual = cat;
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    aplicarFiltrosGlobales();
};

function aplicarFiltrosGlobales() {
    const query = document.getElementById('input-search').value.toLowerCase();
    let filtrados = productos;
    if(categoriaActual !== 'Todas') { filtrados = filtrados.filter(p => p.cat === categoriaActual); }
    if(query) { filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(query)); }
    renderProductos(filtrados);
}

// ==========================================
// 3. Autenticación y Recuperación
// ==========================================
window.togglePassword = () => {
    const pwdInput = document.getElementById('auth-password');
    const toggleBtn = document.getElementById('toggle-pwd-btn');
    if (pwdInput.type === 'password') { pwdInput.type = 'text'; toggleBtn.innerText = '🙈'; } 
    else { pwdInput.type = 'password'; toggleBtn.innerText = '👁️'; }
};

window.cambiarTabAuth = (modo) => {
    modoRegistro = (modo === 'register'); 
    pasoVerificacion = false;
    modoRecuperacion = false; 
    
    document.getElementById('tab-login').classList.toggle('active', !modoRegistro);
    document.getElementById('tab-register').classList.toggle('active', modoRegistro);
    document.getElementById('register-fields').style.display = modoRegistro ? 'block' : 'none';
    document.getElementById('password-area').style.display = 'block';
    document.getElementById('remember-area').style.display = modoRegistro ? 'none' : 'block';
    document.getElementById('verification-area').style.display = 'none';
    document.getElementById('auth-email').style.display = 'block';
    document.getElementById('email-shortcuts').style.display = modoRegistro ? 'flex' : 'none';
    document.getElementById('btn-auth-action').innerText = modoRegistro ? "Crear Cuenta" : "Entrar";
};

window.completarDominio = (dominio) => {
    const emailInput = document.getElementById('auth-email');
    let val = emailInput.value.trim();
    if (val.includes('@')) { val = val.split('@')[0]; }
    if (val !== "") {
        emailInput.value = val + dominio;
        document.getElementById('auth-password').focus(); 
    } else { showToast("⚠️ Escribe tu nombre de usuario primero"); }
};

window.iniciarRecuperacion = () => {
    const u = document.getElementById('auth-email').value.trim().toLowerCase();
    if (!u) return showToast("⚠️ Escribe tu correo arriba primero para cambiar la clave.");

    const existeEnNube = usuariosDeLaNube.find(usr => usr.correo === u);
    if (!existeEnNube) return showToast("❌ Ese correo no está registrado en el sistema.");
    if (existeEnNube.estado === 'Bloqueado') return showToast(`🚫 NO PUEDES RECUPERAR. TU CUENTA ESTÁ BLOQUEADA.<br>Motivo: ${existeEnNube.motivo}`);

    const nuevaPwd = prompt("Ingresa la NUEVA contraseña que deseas (mínimo 4 caracteres):");
    if (!nuevaPwd || nuevaPwd.trim().length < 4) return showToast("⚠️ Operación cancelada o contraseña muy corta.");

    modoRecuperacion = true; pasoVerificacion = true; datosTemporales = { correo: u, clave: nuevaPwd.trim() }; 

    document.getElementById('password-area').style.display = 'none'; document.getElementById('remember-area').style.display = 'none'; document.getElementById('auth-email').style.display = 'none'; document.getElementById('email-shortcuts').style.display = 'none'; document.getElementById('verification-area').style.display = 'block'; document.getElementById('btn-auth-action').innerText = "Verificar Código de Cambio";
    generarYMostrarCodigoOTP();
};

window.generarYMostrarCodigoOTP = () => {
    codigoGeneradoOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const cont = document.getElementById('toast-container'); const t = document.createElement('div'); t.className = 'toast'; 
    t.innerHTML = `📱 CÓDIGO MTA DE VERIFICACIÓN: <strong style="font-size:1.3rem;">${codigoGeneradoOTP}</strong><br><small style="font-weight:normal;">Desaparecerá en 10 segundos</small>`;
    cont.appendChild(t); if (temporizadorOTP) clearTimeout(temporizadorOTP); temporizadorOTP = setTimeout(() => { t.remove(); }, 10000); 
};

window.procesarAuth = async () => {
    const btn = document.getElementById('btn-auth-action');
    const u = document.getElementById('auth-email').value.trim().toLowerCase(); 
    const p = document.getElementById('auth-password').value.trim();
    const checkEl = document.getElementById('remember-me'); const remember = checkEl ? checkEl.checked : false;

    if (modoRecuperacion) {
        const codeInput = document.getElementById('auth-code').value.trim();
        if (codeInput !== codigoGeneradoOTP) return showToast("🔒 Código incorrecto. Genera otro.");
        btn.innerText = "⏳ Guardando en la Nube..."; btn.style.pointerEvents = "none";
        await enviarDatosGoogle({ action: 'cambiarClave', correo: datosTemporales.correo, nuevaClave: datosTemporales.clave });
        const usr = usuariosDeLaNube.find(usr => usr.correo === datosTemporales.correo);
        if(usr) usr.clave = datosTemporales.clave;
        btn.innerText = "Entrar"; btn.style.pointerEvents = "auto";
        showToast("✅ Contraseña actualizada exitosamente. Inicia sesión.");
        cambiarTabAuth('login');
        return;
    }

    if (modoRegistro) {
        if (!pasoVerificacion) {
            const nom = document.getElementById('reg-nombres').value.trim(); const ape = document.getElementById('reg-apellidos').value.trim(); const area = document.getElementById('reg-area').value.trim(); const tel = document.getElementById('reg-telefono').value.trim();
            if(!nom || !ape || !area || !tel || !u || !p) return showToast("⚠️ Completa todos los campos");
            if(!u.includes('@')) return showToast("⚠️ Por favor ingresa un correo válido");
            const existeEnNube = usuariosDeLaNube.find(usr => usr.correo === u);
            if(existeEnNube) return showToast("❌ Correo ya registrado en el sistema");
            datosTemporales = { correo: u, clave: p, nombres: nom, apellidos: ape, area: area, telefono: tel };
            pasoVerificacion = true;
            document.getElementById('register-fields').style.display = 'none'; document.getElementById('auth-email').style.display = 'none'; document.getElementById('email-shortcuts').style.display = 'none'; document.getElementById('password-area').style.display = 'none'; document.getElementById('verification-area').style.display = 'block'; btn.innerText = "Verificar Código";
            generarYMostrarCodigoOTP(); 
        } else {
            const codeInput = document.getElementById('auth-code').value.trim();
            if (codeInput !== codigoGeneradoOTP) return showToast("🔒 Código incorrecto. Genera otro.");
            btn.innerText = "⏳ Creando Cuenta en Nube..."; btn.style.pointerEvents = "none";
            await enviarDatosGoogle({ action: 'registrarCliente', nombres: datosTemporales.nombres, apellidos: datosTemporales.apellidos, area: datosTemporales.area, telefono: datosTemporales.telefono, correo: datosTemporales.correo, clave: datosTemporales.clave });
            usuariosDeLaNube.push(datosTemporales);
            btn.innerText = "Entrar"; btn.style.pointerEvents = "auto"; showToast("🎉 Cuenta creada y sincronizada con la Nube.");
            cambiarTabAuth('login'); 
        }
        return;
    }

    if (!u || !p) return showToast("⚠️ Escribe correo y contraseña");
    if (remember) { setCookie('mta_remember_email', u, 30); setCookie('mta_remember_pass', p, 30); } else { eraseCookie('mta_remember_email'); eraseCookie('mta_remember_pass'); }

    if (u === 'administrador@matatuansiedad.com' && p === 'admin1234') {
        usuarioActivo = 'admin'; datosUsuario = { nombres: 'Administrador', apellidos: 'Maestro', rol: 'admin' }; iniciarSesionSistema(); return;
    }

    const cuentaNube = usuariosDeLaNube.find(usr => usr.correo === u);
    if (!cuentaNube) return showToast("❌ Usuario no existe. Regístrate en la pestaña 'Registrarse'.");
    if (cuentaNube.estado === 'Bloqueado') return showToast(`🚫 TU CUENTA ESTÁ BLOQUEADA.<br><br>Motivo: ${cuentaNube.motivo}`);
    if (!cuentaNube.clave) return showToast("⚠️ Tu cuenta requiere una contraseña nueva. Usa la opción '¿Olvidaste tu contraseña?'");
    if (cuentaNube.clave !== p) return showToast("🔒 Contraseña incorrecta");

    usuarioActivo = u; datosUsuario = cuentaNube; iniciarSesionSistema();
};

function iniciarSesionSistema() {
    setCookie('mta_session_user', usuarioActivo, 7); setCookie('mta_session_data', JSON.stringify(datosUsuario), 7); setCookie('mta_session_time', Date.now(), 7); 
    document.getElementById('welcome-screen').style.display = 'none'; showToast(`👋 ¡Hola, ${datosUsuario.nombres}!`); ejecutarEntrada();
}

function ejecutarEntrada() {
    document.getElementById('welcome-screen').style.display = 'none'; 
    document.getElementById('main-nav').style.display = 'flex'; 
    document.getElementById('btn-user-dropdown').innerText = `👤 Hola, ${datosUsuario.nombres} ▼`;
    const dropdown = document.getElementById('user-dropdown');
    
    if (usuarioActivo === 'admin') {
        document.getElementById('btn-cart-nav').style.display = 'none';
        dropdown.innerHTML = `<a href="#" onclick="abrirPanelAdmin()">⚙️ Panel Administrativo</a><a href="#" style="color: #EF4444;" onclick="cerrarSesion()">Cerrar Sesión</a>`;
        document.getElementById('admin-page').style.display = 'block';
        document.getElementById('store-content').style.display = 'none'; 
    } else {
        document.getElementById('btn-cart-nav').style.display = 'block';
        dropdown.innerHTML = `<a href="#" onclick="abrirPerfil()">Ver Mi Perfil / Facturas</a><a href="#" style="color: #EF4444;" onclick="cerrarSesion()">Cerrar Sesión</a>`;
        document.getElementById('admin-page').style.display = 'none'; 
        document.getElementById('store-content').style.display = 'block'; 
        
        // Carga final de la tienda
        renderCategorias(); 
        aplicarFiltrosGlobales(); 
    }
}

window.cerrarSesion = () => { eraseCookie('mta_session_user'); eraseCookie('mta_session_data'); eraseCookie('mta_session_time'); location.reload(); };

// ==========================================
// 4. Perfil y Facturas
// ==========================================
window.toggleUserMenu = () => { document.getElementById('user-dropdown').classList.toggle('show-dropdown'); };
document.addEventListener('click', function(event) {
    const isClickInsideMenu = event.target.closest('#btn-user-dropdown'); const dropdown = document.getElementById('user-dropdown');
    if (!isClickInsideMenu && dropdown && dropdown.classList.contains('show-dropdown')) dropdown.classList.remove('show-dropdown');
});

window.abrirPerfil = () => {
    const dropdown = document.getElementById('user-dropdown'); if(dropdown) dropdown.classList.remove('show-dropdown');
    if(usuarioActivo === 'admin') return showToast("El admin usa el panel principal.");
    
    document.getElementById('perfil-info').innerHTML = `
        <p style="margin-bottom:5px;"><strong>Nombres:</strong> ${datosUsuario.nombres} ${datosUsuario.apellidos}</p>
        <p style="margin-bottom:5px;"><strong>Teléfono:</strong> ${datosUsuario.telefono}</p>
        <p style="margin-bottom:5px; padding:8px; background: #fff; border-radius:5px; border-left: 4px solid var(--primary);"><strong>Área:</strong> ${datosUsuario.area}</p>
    `;

    const misFacturas = ordenesGlobales.filter(o => o.correo === usuarioActivo);
    const factBox = document.getElementById('perfil-facturas'); factBox.innerHTML = '';

    if (misFacturas.length === 0) factBox.innerHTML = `<p style="text-align:center; color:#666;">Aún no tienes pedidos registrados.</p>`;
    else {
        misFacturas.forEach(f => {
            let bsActualizado = f.totalUsd * TASA_BCV;
            let estadoHTML = "";
            if (f.cancelado) {
                estadoHTML = `<span class="badge-estado badge-rojo" style="display:block; margin-top:5px; white-space:normal;">🚫 CANCELADO: ${f.motivoCancelacion}</span>`;
            } else {
                let badgeEntrega = f.entregado ? '<span class="badge-estado badge-verde">✅ Entregado</span>' : '<span class="badge-estado badge-gris">⏳ Prep. Entrega</span>';
                let badgePago = f.pagado ? '<span class="badge-estado badge-verde">✅ Pagado / Cancelado</span>' : '<span class="badge-estado badge-rojo">❌ Pago Pendiente</span>';
                estadoHTML = `<br>${badgeEntrega} ${badgePago}`;
            }

            factBox.innerHTML += `<div class="historial-item"><strong>Factura #${f.id}</strong> | ${f.fecha} <br><strong>Modalidad:</strong> ${f.metodo.toUpperCase()}<br><strong>Monto (Tasa Hoy):</strong> $${f.totalUsd.toFixed(2)} | ${bsActualizado.toFixed(2)} Bs.${estadoHTML}<br><button class="btn-text" style="font-size:0.8rem; margin-top:5px;" onclick="verTicketAntiguo('${f.id}')">🔍 Ver Ticket Detallado</button></div>`;
        });
    }
    document.getElementById('modal-perfil').style.display = 'flex';
};

window.verTicketAntiguo = (idFicha) => {
    const f = ordenesGlobales.find(x => x.id === idFicha);
    if(f) { let bsActualizado = f.totalUsd * TASA_BCV; generarTicketHTML(f.nombres, f.apellidos, f.area, f.metodo, f.totalUsd, bsActualizado, f.items); }
};

// ==========================================
// 5. Catálogo, Detalle y Carrito
// ==========================================
function renderProductos(lista) {
    const grid = document.getElementById('product-grid'); grid.innerHTML = '';
    if(lista.length === 0) {
        document.getElementById('search-error').style.display = 'block'; 
        document.getElementById('search-error').innerHTML = "🕵️ ¡Ups! Parece que no hay antojos con ese nombre o en esa categoría."; 
        return;
    } else { document.getElementById('search-error').style.display = 'none'; }

    lista.forEach(p => {
        const agotado = p.stock <= 0; const precioBs = (p.precio * TASA_BCV).toFixed(2);
        let btnAñadirHtml = '';
        if (usuarioActivo !== 'admin') btnAñadirHtml = `<button type="button" class="btn-primary" ${agotado ? 'disabled' : ''} onclick="agregarAlCarrito(${p.id})">Agregar 🛒</button>`;
        
        grid.innerHTML += `
            <div class="product-card ${agotado ? 'agotado' : ''}">
                ${agotado ? '<span class="badge-agotado">AGOTADO</span>' : ''}
                <img src="${p.img}" class="card-img" onclick="abrirDetalle(${p.id})">
                <h3 class="prod-title">${p.nombre}</h3>
                <p class="prod-price-usd">$${p.precio.toFixed(2)} USD</p>
                <p class="prod-price-bs">${precioBs} Bs</p>
                <p class="prod-stock">${agotado ? 'Sin existencias' : `Quedan: ${p.stock}`}</p>
                ${btnAñadirHtml}
            </div>`;
    });
}

window.abrirDetalle = (id) => {
    const p = productos.find(x => x.id === id); if(!p) return;
    const precioMostrarUsd = `$${p.precio.toFixed(2)} USD`; const precioMostrarBs = `${(p.precio * TASA_BCV).toFixed(2)} Bs`;
    let btnAñadirHtml = '';
    if (usuarioActivo !== 'admin') btnAñadirHtml = `<button type="button" class="btn-primary" ${p.stock <= 0 ? 'disabled' : ''} onclick="agregarAlCarrito(${p.id}); cerrarModales();" style="width: 100%;">${p.stock <= 0 ? 'Agotado' : 'Añadir al Carrito 🛒'}</button>`;
    
    document.getElementById('detalle-body').innerHTML = `
        <div class="img-zoom-container"><img src="${p.img}" class="img-zoom"></div>
        <h2>${p.nombre}</h2><h3 class="prod-price-usd" style="font-size: 2rem;">${precioMostrarUsd}</h3><p class="prod-price-bs">${precioMostrarBs}</p><p style="margin: 15px 0; color: #666;">Snack perfecto para matar tu ansiedad.</p>
        ${btnAñadirHtml}
    `;
    document.getElementById('modal-detalle').style.display = 'flex';
};

window.agregarAlCarrito = (id) => {
    const p = productos.find(x => x.id === id); const itemEnCarrito = carrito.find(x => x.id === id);
    if (itemEnCarrito) {
        if (itemEnCarrito.qty < p.stock) { itemEnCarrito.qty++; showToast("Cantidad aumentada 🍬"); }
        else { showToast("No hay más stock disponible ❌"); return; }
    } else { carrito.push({ ...p, qty: 1 }); showToast("Agregado al carrito 🛒"); }
    actualizarIconoCarrito();
};

function actualizarIconoCarrito() { let count = 0; carrito.forEach(i => count += i.qty); document.getElementById('cart-count').innerText = count; }
window.abrirCarrito = () => { renderContenidoCarrito(); document.getElementById('modal-carrito').style.display = 'flex'; };

function renderContenidoCarrito() {
    const list = document.getElementById('cart-items'); let subtotal = 0; list.innerHTML = '';
    if (carrito.length === 0) { list.innerHTML = '<p style="text-align:center;">🛒 ¡Tu carrito está muy triste y vacío! Ve a la tienda a calmar tu ansiedad.</p>'; }
    else {
        carrito.forEach((item, index) => {
            subtotal += item.precio * item.qty;
            list.innerHTML += `<div class="cart-item"><span style="flex:2; text-align:left; font-size:0.9rem;">${item.nombre}</span><div class="qty-controls"><button class="qty-btn" onclick="cambiarCant(${index}, -1)">-</button><span>${item.qty}</span><button class="qty-btn" onclick="cambiarCant(${index}, 1)">+</button></div><span style="flex:1; text-align:right; font-weight:bold;">$${(item.precio * item.qty).toFixed(2)}</span></div>`;
        });
    }
    document.getElementById('cart-total-usd').innerText = `$${subtotal.toFixed(2)}`; renderSugerencias();
}

window.cambiarCant = (index, delta) => {
    const item = carrito[index]; const original = productos.find(p => p.id === item.id);
    if (item.qty + delta > 0 && item.qty + delta <= original.stock) { item.qty += delta; }
    else if (item.qty + delta === 0) { carrito.splice(index, 1); }
    actualizarIconoCarrito(); renderContenidoCarrito();
};

function renderSugerencias() {
    const sugBox = document.getElementById('cart-suggestions'); sugBox.innerHTML = ''; if(carrito.length === 0) return;
    const catsEnCarrito = carrito.map(c => c.cat);
    const catPred = catsEnCarrito.filter(c => c === 'Dulce').length >= catsEnCarrito.filter(c => c === 'Salado').length ? 'Salado' : 'Dulce'; 
    let sugeridos = productos.filter(p => !carrito.some(c => c.id === p.id) && p.stock > 0).sort((a, b) => (a.cat === catPred ? -1 : 1)); 
    sugeridos.slice(0, 3).forEach(p => {
        sugBox.innerHTML += `<div class="sug-card" onclick="agregarAlCarrito(${p.id}); renderContenidoCarrito();"><img src="${p.img}"><p style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><strong>${p.nombre}</strong></p><p style="color:var(--primary); font-size:0.9rem;">+ $${p.precio.toFixed(2)}</p></div>`;
    });
}

// ==========================================
// 6. Checkout y Creación de Factura Global
// ==========================================
window.irACheckout = () => {
    if(carrito.length === 0) return showToast("Agrega algo para calmar tu ansiedad.");
    cerrarModales(); document.getElementById('store-content').style.display = 'none'; document.getElementById('checkout-page').style.display = 'block';
    document.getElementById('chk-nombres').value = datosUsuario.nombres; document.getElementById('chk-apellidos').value = datosUsuario.apellidos; document.getElementById('chk-ubicacion').value = datosUsuario.area;
    renderResumenCheckout();
};
window.irAInicio = () => { document.getElementById('checkout-page').style.display = 'none'; document.getElementById('admin-page').style.display = 'none'; document.getElementById('store-content').style.display = 'block'; aplicarFiltrosGlobales(); };

function renderResumenCheckout() {
    const list = document.getElementById('chk-resumen-lista'); const metodo = document.getElementById('chk-metodo').value; 
    let subtotalUsd = 0; list.innerHTML = '';
    carrito.forEach(i => { subtotalUsd += (i.precio * i.qty); list.innerHTML += `<p style="font-size:0.9rem; margin-bottom:5px;">• ${i.nombre} (x${i.qty})</p>`; });
    let factor = metodo === 'credito' ? 1.20 : 1.00; let totalCobrarUsd = subtotalUsd * factor; let totalCobrarBs = totalCobrarUsd * TASA_BCV;
    let notaCredito = metodo === 'credito' ? `<br><span style="font-size:0.8rem; color: #EF4444;">*Incluye +20% por plazo quincenal*</span>` : '';
    document.getElementById('chk-subtotal-usd').innerHTML = `$${totalCobrarUsd.toFixed(2)} ${notaCredito}`; document.getElementById('chk-total-bs').innerText = `${totalCobrarBs.toFixed(2)} Bs`;
    return { totalCobrarUsd, totalCobrarBs, metodo };
}

window.finalizarCompra = async () => {
    const btnComprar = document.querySelector('#checkout-page .checkout-box .btn-primary');
    if(btnComprar) { btnComprar.innerText = "⏳ Procesando Pedido..."; btnComprar.style.pointerEvents = "none"; }

    const n = document.getElementById('chk-nombres').value; const a = document.getElementById('chk-apellidos').value; const u = document.getElementById('chk-ubicacion').value; const m = document.getElementById('chk-metodo').value;
    const { totalCobrarUsd, totalCobrarBs } = renderResumenCheckout();

    carrito.forEach(item => { let prod = productos.find(p => p.id === item.id); if(prod) prod.stock -= item.qty; });
    
    let unicos = []; let map = new Map();
    for (let item of productos) { if(!map.has(item.id)){ map.set(item.id, true); unicos.push(item); } }
    productos = unicos;

    await respaldarInventarioEnNube(); 
    localStorage.setItem('mta_productos', JSON.stringify(productos)); 

    const nuevaFacturaGlobal = { id: "MTA" + Date.now().toString().slice(-6), fecha: new Date().toLocaleDateString('es-VE'), hora: new Date().toLocaleTimeString('es-VE'), correo: usuarioActivo, nombres: n, apellidos: a, area: u, items: [...carrito], totalUsd: totalCobrarUsd, metodo: m, pagado: (m === 'contado'), entregado: false, cancelado: false, motivoCancelacion: "" };
    ordenesGlobales.unshift(nuevaFacturaGlobal); localStorage.setItem('mta_global_orders', JSON.stringify(ordenesGlobales));

    if (m === 'credito') {
        await enviarDatosGoogle({ action: 'nuevaCompra', correo: usuarioActivo, nombres: n + " " + a, totalUsd: totalCobrarUsd, detalles: JSON.stringify(carrito) });
    }

    if(btnComprar) { btnComprar.innerText = "Enviar Pedido al Líder"; btnComprar.style.pointerEvents = "auto"; }

    generarTicketHTML(n, a, u, m, totalCobrarUsd, totalCobrarBs, carrito);
    
    let txt = `🍬 *MATA TU ANSIEDAD - NUEVO PEDIDO*%0A%0A👤 *Cliente:* ${n} ${a}%0A📍 *Ubicación:* ${u}%0A💳 *Pago:* ${m === 'contado' ? 'De Contado' : 'Crédito Quincena'}%0A%0A*🛒 DETALLE:*%0A`;
    carrito.forEach(i => txt += `- ${i.nombre} (x${i.qty})%0A`);
    txt += `%0A💰 *TOTAL:* $${totalCobrarUsd.toFixed(2)} / ${totalCobrarBs.toFixed(2)} Bs.%0A%0A*MATA TU ANSIEDAD, TU PEDIDO HA SIDO RECIBIDO EXITOSAMENTE. POR FAVOR, TENGAN EN CUENTA QUE LAS HORAS DE ENTREGA VAN A SER DE 7 DE LA MAÑANA SOLAMENTE Y 7:30 DE LA NOCHE, NO MÁS.*%0A%0A*POR FAVOR, MANTENER ESTO EN DISCRECIÓN, NO IR AL ÁREA DE FARMACIA A COMUNICARLO, TODO POR EL GRUPO DE WHATSAPP.*`;

    carrito = []; actualizarIconoCarrito(); setTimeout(() => { window.open(`https://wa.me/${NUMERO_LIDER_WHATSAPP}?text=${txt}`, '_blank'); }, 3000);
};

function generarTicketHTML(nom, ape, ubi, metodo, tUsd, tBs, itemsTicket) {
    const tContent = document.getElementById('ticket-content'); let itemsStr = itemsTicket.map(i => `<tr><td>${i.qty}x ${i.nombre}</td><td style="text-align:right;">$${(i.precio*i.qty).toFixed(2)}</td></tr>`).join('');
    tContent.innerHTML = `<h2>🍬 MATA TU ANSIEDAD</h2><p style="font-size: 0.7rem; color: #666; margin-bottom: 10px;">Ticket / Tasa (Hoy): ${TASA_BCV.toFixed(2)}</p><p style="font-size: 0.8rem; text-align: left;"><strong>Cliente:</strong> ${nom} ${ape}<br><strong>Área:</strong> ${ubi}<br><strong>Modalidad:</strong> ${metodo.toUpperCase()}</p><table class="ticket-table"><thead><tr><th>Cant/Desc</th><th style="text-align:right;">Monto</th></tr></thead><tbody>${itemsStr}</tbody></table><h3 style="text-align: right; margin-top: 10px;">Total USD: $${tUsd.toFixed(2)}</h3><h4 style="text-align: right; color: #666;">Total Bs: ${tBs.toFixed(2)}</h4><p style="font-size: 0.7rem; margin-top: 20px;">Tome captura de este ticket como soporte de su compra.</p><button type="button" class="btn-primary" onclick="irAInicio(); cerrarModales();" style="width:100%; margin-top:15px;">Aceptar y Salir</button>`;
    document.getElementById('modal-ticket').style.display = 'flex';
}

// ==========================================
// 7. Panel de Administrador Profesional
// ==========================================
window.abrirPanelAdmin = () => {
    const dropdown = document.getElementById('user-dropdown'); if(dropdown) dropdown.classList.remove('show-dropdown');
    document.getElementById('store-content').style.display = 'none'; document.getElementById('checkout-page').style.display = 'none'; document.getElementById('admin-page').style.display = 'block'; cambiarSeccionAdmin('inventario');
};

window.cambiarSeccionAdmin = (seccion) => {
    document.getElementById('admin-seccion-inventario').style.display = seccion === 'inventario' ? 'block' : 'none';
    document.getElementById('admin-seccion-pedidos').style.display = seccion === 'pedidos' ? 'block' : 'none';
    document.getElementById('admin-seccion-usuarios').style.display = seccion === 'usuarios' ? 'block' : 'none';
    document.getElementById('admin-seccion-deudas').style.display = seccion === 'deudas' ? 'block' : 'none';
    document.getElementById('admin-seccion-reportes').style.display = seccion === 'reportes' ? 'block' : 'none';
    document.getElementById('admin-seccion-config').style.display = seccion === 'config' ? 'block' : 'none';
    
    if(seccion === 'inventario') renderAdminInventario(); 
    if(seccion === 'pedidos') renderAdminPedidos(); 
    if(seccion === 'usuarios') renderAdminUsuarios();
    if(seccion === 'deudas') renderAdminDeudas(); 
    if(seccion === 'reportes') renderAdminReportes(); 
    if(seccion === 'config') renderAdminConfig();
};

function renderAdminInventario() {
    const catSelect = document.getElementById('admin-add-cat');
    catSelect.innerHTML = categoriasMTA.map(c => `<option value="${c}">${c}</option>`).join(''); catSelect.innerHTML += `<option value="otra">➕ Crear nueva categoría...</option>`;
    const list = document.getElementById('admin-inventory-list'); list.innerHTML = '';
    productos.forEach(p => {
        let pBs = (p.precio * TASA_BCV).toFixed(2);
        list.innerHTML += `<tr><td><div style="display:flex; align-items:center; gap:10px;"><img src="${p.img}" style="width:45px; height:45px; border-radius:8px; object-fit:cover; box-shadow:0 2px 5px rgba(0,0,0,0.1);"><div><strong style="display:block;">${p.nombre}</strong><span style="font-size:0.75rem; background:var(--bg-color); color:var(--primary); padding:2px 6px; border-radius:4px;">${p.cat}</span></div></div></td><td><div style="display:flex; align-items:center; gap:5px;"><span style="color:#666;">$</span><input type="number" step="0.10" value="${p.precio}" id="adm-precio-${p.id}" class="admin-input-table" style="width:70px;"></div><span style="font-size:0.75rem; color:#888; display:block; margin-top:3px;">≈ ${pBs} Bs</span></td><td><input type="number" value="${p.stock}" id="adm-stock-${p.id}" class="admin-input-table"></td><td style="text-align:center;"><button type="button" class="btn-primary" style="padding: 4px 8px; font-size:0.75rem; margin-bottom:5px; width:90px;" onclick="guardarCambioAdmin(${p.id})">💾 Rápido</button><br><button type="button" class="btn-primary" style="background:#3B82F6; padding: 4px 8px; font-size:0.75rem; margin-bottom:5px; width:90px;" onclick="abrirModalEditar(${p.id})">✏️ Detalles</button><br><button type="button" class="btn-primary" style="background:#EF4444; padding: 4px 8px; font-size:0.75rem; width:90px;" onclick="eliminarProductoAdmin(${p.id})">🗑️ Eliminar</button></td></tr>`;
    });
}

window.verificarNuevaCategoria = (idSelect, idGroup) => { const val = document.getElementById(idSelect).value; document.getElementById(idGroup).style.display = (val === 'otra') ? 'block' : 'none'; };

window.guardarCambioAdmin = async (id) => {
    const prod = productos.find(x => x.id === id);
    if(prod) {
        prod.precio = parseFloat(document.getElementById(`adm-precio-${id}`).value); prod.stock = parseInt(document.getElementById(`adm-stock-${id}`).value);
        await respaldarInventarioEnNube(); 
        localStorage.setItem('mta_productos', JSON.stringify(productos)); showToast("Inventario actualizado ✅"); renderAdminInventario(); 
    }
};

window.eliminarProductoAdmin = async (id) => {
    if(confirm("⚠️ ¿Estás seguro de eliminar este producto?")) {
        productos = productos.filter(p => p.id !== id);
        await respaldarInventarioEnNube(); 
        localStorage.setItem('mta_productos', JSON.stringify(productos)); showToast("🗑️ Producto eliminado"); renderAdminInventario();
    }
};

window.actualizarTextoFoto = (input, origen, idMsg, idOtherInput) => { const msg = document.getElementById(idMsg); if(input.files && input.files[0]) { msg.innerHTML = `✅ Foto lista (${origen}): ${input.files[0].name}`; msg.style.color = "#10B981"; if (idOtherInput) document.getElementById(idOtherInput).value = ''; } };

window.procesarImagenLocal = (file) => { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const MAX_WIDTH = 800; const MAX_HEIGHT = 800; let width = img.width; let height = img.height; if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.7)); }; img.src = e.target.result; }; reader.readAsDataURL(file); }); };

window.agregarProductoAdmin = async () => {
    const btnSave = document.getElementById('btn-save-prod'); const n = document.getElementById('admin-add-nombre').value.trim(); let c = document.getElementById('admin-add-cat').value; const p = parseFloat(document.getElementById('admin-add-precio').value); const s = parseInt(document.getElementById('admin-add-stock').value); const urlImg = document.getElementById('admin-add-img-url').value.trim(); const fileGallery = document.getElementById('admin-add-img-gallery'); const fileCamera = document.getElementById('admin-add-img-camera');
    if (c === 'otra') { const nuevaCat = document.getElementById('admin-add-new-cat').value.trim(); if (!nuevaCat) return showToast("⚠️ Escribe la categoría"); c = nuevaCat.charAt(0).toUpperCase() + nuevaCat.slice(1).toLowerCase(); if (!categoriasMTA.includes(c)) { categoriasMTA.push(c); localStorage.setItem('mta_categorias', JSON.stringify(categoriasMTA)); } }
    let fileToUpload = null; if (fileGallery.files && fileGallery.files[0]) fileToUpload = fileGallery.files[0]; else if (fileCamera.files && fileCamera.files[0]) fileToUpload = fileCamera.files[0];
    let finalImg = urlImg; if (fileToUpload) { btnSave.innerText = "⏳ Procesando Foto..."; btnSave.style.pointerEvents = "none"; finalImg = await procesarImagenLocal(fileToUpload); }
    if(!n || isNaN(p) || isNaN(s) || !finalImg) { btnSave.innerText = "💾 Guardar Producto en Catálogo"; btnSave.style.pointerEvents = "auto"; return showToast("⚠️ Llena todos los campos o sube una imagen"); }
    const nuevoProd = { id: Date.now(), nombre: n, cat: c, precio: p, stock: s, img: finalImg }; productos.unshift(nuevoProd);
    
    await respaldarInventarioEnNube(); 
    localStorage.setItem('mta_productos', JSON.stringify(productos)); showToast("✨ Producto agregado exitosamente");
    document.getElementById('admin-add-nombre').value = ''; document.getElementById('admin-add-precio').value = ''; document.getElementById('admin-add-stock').value = ''; document.getElementById('admin-add-img-url').value = ''; document.getElementById('admin-add-img-gallery').value = ''; document.getElementById('admin-add-img-camera').value = ''; document.getElementById('file-msg-text').innerHTML = 'Ninguna imagen seleccionada'; document.getElementById('admin-add-new-cat').value = ''; document.getElementById('grupo-nueva-cat').style.display = 'none';
    btnSave.innerText = "💾 Guardar Producto en Catálogo"; btnSave.style.pointerEvents = "auto"; 
    renderAdminInventario();
};

window.abrirModalEditar = (id) => {
    const p = productos.find(x => x.id === id); if(!p) return; productoEnEdicionId = id;
    document.getElementById('edit-nombre').value = p.nombre; document.getElementById('edit-precio').value = p.precio; document.getElementById('edit-stock').value = p.stock;
    const catSelect = document.getElementById('edit-cat'); catSelect.innerHTML = categoriasMTA.map(c => `<option value="${c}">${c}</option>`).join(''); catSelect.innerHTML += `<option value="otra">➕ Crear nueva categoría...</option>`;
    if (categoriasMTA.includes(p.cat)) { catSelect.value = p.cat; document.getElementById('grupo-nueva-cat-edit').style.display = 'none'; } else { catSelect.value = 'otra'; document.getElementById('grupo-nueva-cat-edit').style.display = 'block'; document.getElementById('edit-new-cat').value = p.cat; }
    document.getElementById('edit-img-preview').src = p.img; document.getElementById('edit-img-gallery').value = ''; document.getElementById('edit-img-camera').value = ''; document.getElementById('edit-img-url').value = ''; document.getElementById('edit-file-msg-text').innerHTML = 'Mantendremos la imagen actual si no seleccionas otra.'; document.getElementById('edit-file-msg-text').style.color = "var(--text-sub)";
    document.getElementById('modal-admin-editar').style.display = 'flex';
};

window.guardarEdicionAdmin = async () => {
    const btnSave = document.getElementById('btn-update-prod'); const p = productos.find(x => x.id === productoEnEdicionId); if(!p) return;
    const n = document.getElementById('edit-nombre').value.trim(); let c = document.getElementById('edit-cat').value; const precio = parseFloat(document.getElementById('edit-precio').value); const stock = parseInt(document.getElementById('edit-stock').value); const urlImg = document.getElementById('edit-img-url').value.trim(); const fileGallery = document.getElementById('edit-img-gallery'); const fileCamera = document.getElementById('edit-img-camera');
    if (c === 'otra') { const nuevaCat = document.getElementById('edit-new-cat').value.trim(); if (!nuevaCat) return showToast("⚠️ Escribe la categoría"); c = nuevaCat.charAt(0).toUpperCase() + nuevaCat.slice(1).toLowerCase(); if (!categoriasMTA.includes(c)) { categoriasMTA.push(c); localStorage.setItem('mta_categorias', JSON.stringify(categoriasMTA)); } }
    let fileToUpload = null; if (fileGallery && fileGallery.files && fileGallery.files[0]) fileToUpload = fileGallery.files[0]; else if (fileCamera && fileCamera.files && fileCamera.files[0]) fileToUpload = fileCamera.files[0];
    btnSave.innerText = "⏳ Procesando..."; btnSave.style.pointerEvents = "none";
    let finalImg = urlImg; if (fileToUpload) { finalImg = await procesarImagenLocal(fileToUpload); } else if (!urlImg) { finalImg = p.img; }
    if(!n || isNaN(precio) || isNaN(stock)) { btnSave.innerText = "🔄 Actualizar Producto"; btnSave.style.pointerEvents = "auto"; return showToast("⚠️ Llena los campos básicos obligatorios"); }
    p.nombre = n; p.cat = c; p.precio = precio; p.stock = stock; p.img = finalImg;
    
    await respaldarInventarioEnNube(); 
    localStorage.setItem('mta_productos', JSON.stringify(productos)); showToast("✨ Producto actualizado exitosamente"); document.getElementById('modal-admin-editar').style.display = 'none'; renderAdminInventario();
    btnSave.innerText = "🔄 Actualizar Producto"; btnSave.style.pointerEvents = "auto";
};

// ==========================================
// 8. Panel de Usuarios y Deudas
// ==========================================
function renderAdminUsuarios() {
    const list = document.getElementById('admin-users-list'); list.innerHTML = '';
    if (usuariosDeLaNube.length === 0) { list.innerHTML = `<tr><td colspan="4" style="text-align:center;">No hay usuarios registrados</td></tr>`; return; }
    
    usuariosDeLaNube.forEach(u => {
        if(u.correo === 'administrador@matatuansiedad.com') return; 
        let estadoBadge = u.estado === 'Bloqueado' ? `<span class="badge-estado badge-rojo" style="display:block; text-align:center;">🚫 Bloqueado<br><small style="font-weight:normal;">${u.motivo}</small></span>` : `<span class="badge-estado badge-verde">✅ Activo</span>`;
        let btnBloquear = u.estado === 'Bloqueado' 
            ? `<button type="button" class="btn-primary" style="background:#10B981; padding:5px 10px; font-size:0.75rem; width:120px; margin-bottom:5px;" onclick="desbloquearUsuarioAdmin('${u.correo}')">✅ Desbloquear</button>`
            : `<button type="button" class="btn-primary" style="background:#F59E0B; padding:5px 10px; font-size:0.75rem; width:120px; margin-bottom:5px;" onclick="bloquearUsuarioAdmin('${u.correo}')">⚠️ Bloquear</button>`;
        
        list.innerHTML += `<tr>
            <td><strong>${u.nombres} ${u.apellidos}</strong><br><span style="font-size:0.75rem; color:#666;">${u.correo}</span></td>
            <td><strong>${u.telefono}</strong><br><span style="font-size:0.8rem; color:var(--primary);">${u.area}</span></td>
            <td style="text-align:center;">${estadoBadge}</td>
            <td style="text-align:center;">${btnBloquear}<br><button type="button" class="btn-primary" style="background:#EF4444; padding:5px 10px; font-size:0.75rem; width:120px;" onclick="eliminarUsuarioAdmin('${u.correo}')">🗑️ Eliminar</button></td>
        </tr>`;
    });
}

function renderAdminDeudas() {
    const list = document.getElementById('admin-deudas-list'); list.innerHTML = '';
    const deudores = deudasGlobales.filter(d => d.total > 0); 
    if (deudores.length === 0) { list.innerHTML = `<tr><td colspan="3" style="text-align:center;">No hay clientes con deudas pendientes. ¡Excelente!</td></tr>`; return; }
    
    deudores.forEach(d => {
        let bsActualizado = d.total * TASA_BCV; 
        list.innerHTML += `<tr>
            <td><strong>${d.nombre}</strong><br><span style="font-size:0.75rem; color:#666;">${d.correo}</span></td>
            <td><strong>$${d.total.toFixed(2)}</strong><br><span style="font-size:0.8rem; color:var(--text-sub);">${bsActualizado.toFixed(2)} Bs</span></td>
            <td style="text-align:center;"><button type="button" class="btn-primary" style="background:#10B981; padding:5px 10px; font-size:0.75rem; width:120px;" onclick="saldarDeudaAdmin('${d.correo}')">✅ Saldar Deuda</button></td>
        </tr>`;
    });
}

function renderAdminReportes() {
    const list = document.getElementById('admin-reportes-list'); list.innerHTML = '';
    
    let fInicioStr = document.getElementById('reporte-inicio').value;
    let fFinStr = document.getElementById('reporte-fin').value;
    
    let filtrados = pagosGlobales;
    
    if (fInicioStr && fFinStr) {
        let dInicio = new Date(fInicioStr + "T00:00:00");
        let dFin = new Date(fFinStr + "T23:59:59");
        filtrados = pagosGlobales.filter(p => {
            let d = new Date(p.fecha);
            return d >= dInicio && d <= dFin;
        });
    }

    if (filtrados.length === 0) { list.innerHTML = `<tr><td colspan="3" style="text-align:center;">No hay pagos registrados en este rango de fechas.</td></tr>`; return; }
    
    filtrados.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

    filtrados.forEach(p => {
        let fechaLimpia = new Date(p.fecha).toLocaleDateString('es-VE');
        list.innerHTML += `<tr>
            <td><strong>${fechaLimpia}</strong></td>
            <td><strong>${p.nombre}</strong><br><span style="font-size:0.75rem; color:#666;">${p.correo}</span></td>
            <td><strong>$${p.monto.toFixed(2)} USD</strong></td>
        </tr>`;
    });
}

window.descargarPagosCSV = () => {
    let fInicioStr = document.getElementById('reporte-inicio').value;
    let fFinStr = document.getElementById('reporte-fin').value;
    
    let filtrados = pagosGlobales;
    
    if (fInicioStr && fFinStr) {
        let dInicio = new Date(fInicioStr + "T00:00:00");
        let dFin = new Date(fFinStr + "T23:59:59");
        filtrados = pagosGlobales.filter(p => { let d = new Date(p.fecha); return d >= dInicio && d <= dFin; });
    }

    if(filtrados.length === 0) return showToast("No hay pagos para exportar en estas fechas.");
    
    filtrados.sort((a, b) => a.nombre.localeCompare(b.nombre));

    let agrupados = {};
    filtrados.forEach(p => {
        if(!agrupados[p.correo]) agrupados[p.correo] = { nombre: p.nombre, pagos: [], totalUsd: 0 };
        agrupados[p.correo].pagos.push(p);
        agrupados[p.correo].totalUsd += p.monto;
    });

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "FECHA;CORREO;NOMBRE DEL CLIENTE;MONTO (USD);MONTO ESTIMADO (BS)\n";
    
    let granTotalUsd = 0;
    
    for (let correo in agrupados) {
        let usr = agrupados[correo];
        
        usr.pagos.forEach(p => {
            let fechaF = new Date(p.fecha).toLocaleDateString('es-VE');
            let montoBs = (p.monto * TASA_BCV).toFixed(2);
            csvContent += `${fechaF};${p.correo};${p.nombre};${p.monto.toFixed(2)};${montoBs}\n`;
        });
        
        let totalUsd = usr.totalUsd;
        let totalBs = (totalUsd * TASA_BCV).toFixed(2);
        granTotalUsd += totalUsd;
        
        csvContent += `;;TOTAL DE ${usr.nombre.toUpperCase()};${totalUsd.toFixed(2)};${totalBs}\n`;
        csvContent += `;;;;\n`; 
    }
    
    let granTotalBs = (granTotalUsd * TASA_BCV).toFixed(2);
    csvContent += `;;GRAN TOTAL RECAUDADO;${granTotalUsd.toFixed(2)};${granTotalBs}\n`;

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Reporte_Contable_MTA_${fInicioStr || 'Todo'}_al_${fFinStr || 'Todo'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.saldarDeudaAdmin = async (correo) => {
    if(confirm("¿Estás seguro de perdonar/saldar esta deuda? Esto la pondrá en $0 en la base de datos de forma permanente.")) {
        showToast("⏳ Procesando el pago en la Nube...");
        await enviarDatosGoogle({ action: 'marcarPagado', correo: correo });
        
        let deuda = deudasGlobales.find(d => d.correo === correo);
        if(deuda) deuda.total = 0;
        
        ordenesGlobales.forEach(o => { if (o.correo === correo && o.metodo === 'credito') o.pagado = true; });
        localStorage.setItem('mta_global_orders', JSON.stringify(ordenesGlobales));
        
        showToast("✅ Deuda saldada correctamente.");
        renderAdminDeudas();
    }
};

window.bloquearUsuarioAdmin = async (correo) => {
    let motivo = prompt("Indica el motivo del bloqueo (Ej: Debe dinero, Facturas pendientes):");
    if(motivo) {
        showToast("⏳ Bloqueando usuario en la Nube...");
        await enviarDatosGoogle({ action: 'bloquearCliente', correo: correo, motivo: motivo });
        let usr = usuariosDeLaNube.find(u => u.correo === correo);
        if(usr) { usr.estado = 'Bloqueado'; usr.motivo = motivo; }
        showToast("🚫 Usuario bloqueado exitosamente.");
        renderAdminUsuarios();
    }
};

window.desbloquearUsuarioAdmin = async (correo) => {
    showToast("⏳ Desbloqueando usuario en la Nube...");
    await enviarDatosGoogle({ action: 'desbloquearCliente', correo: correo });
    let usr = usuariosDeLaNube.find(u => u.correo === correo);
    if(usr) { usr.estado = 'Activo'; usr.motivo = ""; }
    showToast("✅ Usuario activado exitosamente.");
    renderAdminUsuarios();
};

window.eliminarUsuarioAdmin = async (correo) => {
    if(confirm("⚠️ ¿Estás COMPLETAMENTE SEGURO de eliminar a este usuario? Perderá acceso inmediato.")) {
        showToast("⏳ Eliminando usuario en la Nube...");
        await enviarDatosGoogle({ action: 'eliminarCliente', correo: correo });
        usuariosDeLaNube = usuariosDeLaNube.filter(u => u.correo !== correo);
        showToast("🗑️ Usuario borrado. Si no debía dinero, también se eliminó de la matriz.");
        renderAdminUsuarios();
    }
};

// ==========================================
// 9. Pedidos y Configuración Admin
// ==========================================
function renderAdminPedidos() {
    const list = document.getElementById('admin-orders-list'); list.innerHTML = '';
    if (ordenesGlobales.length === 0) { list.innerHTML = `<tr><td colspan="4" style="text-align:center;">No hay pedidos registrados</td></tr>`; return; }
    
    ordenesGlobales.forEach(o => {
        let bsActualizado = o.totalUsd * TASA_BCV; 
        let txtEntrega = o.entregado ? 'Marcar NO Entregado' : 'Marcar Entregado'; 
        let colorEntrega = o.entregado ? '#10B981' : '#6B7280'; 
        let txtPago = o.pagado ? 'Marcar como Deuda' : 'Marcar Pagado'; 
        let colorPago = o.pagado ? '#10B981' : '#EF4444'; 
        
        let botonesEstado = "";
        if (o.cancelado) {
            botonesEstado = `<span style="color:#EF4444; font-size:0.8rem; font-weight:bold; display:block; margin-top:5px;">🚫 Cancelado: ${o.motivoCancelacion}</span>`;
        } else {
            botonesEstado = `
                <button type="button" class="btn-primary" style="background:${colorEntrega}; padding:5px 10px; font-size:0.75rem; margin-bottom:5px; width: 140px;" onclick="toggleAdminStatus('${o.id}', 'entrega')">${txtEntrega}</button><br>
                <button type="button" class="btn-primary" style="background:${colorPago}; padding:5px 10px; font-size:0.75rem; width: 140px;" onclick="toggleAdminStatus('${o.id}', 'pago')">${txtPago}</button><br>
                <button type="button" class="btn-primary" style="background:#EF4444; padding:5px 10px; font-size:0.75rem; width: 140px; margin-top:5px;" onclick="cancelarPedidoAdmin('${o.id}')">🚫 Cancelar</button>
            `;
        }
        
        list.innerHTML += `<tr><td><strong>#${o.id}</strong><br><span style="font-size:0.75rem; color:#666;">${o.fecha} ${o.hora}</span></td><td><strong>${o.nombres} ${o.apellidos}</strong><br><span style="font-size:0.8rem; color:var(--primary);">${o.area}</span></td><td><strong>$${o.totalUsd.toFixed(2)}</strong><br><span style="font-size:0.75rem;">${bsActualizado.toFixed(2)} Bs</span><br><span style="font-size:0.7rem; font-weight:bold;">${o.metodo.toUpperCase()}</span></td><td>${botonesEstado}</td></tr>`;
    });
}

window.cancelarPedidoAdmin = async (id) => {
    let order = ordenesGlobales.find(o => o.id === id);
    if(order && !order.cancelado) {
        let motivo = prompt("Indique el motivo de la cancelación para que el cliente lo vea:");
        if(motivo) {
            order.cancelado = true; order.motivoCancelacion = motivo;
            order.items.forEach(item => { let prod = productos.find(p => p.id === item.id); if(prod) prod.stock += item.qty; });
            let unicos = []; let map = new Map();
            for (let item of productos) { if(!map.has(item.id)){ map.set(item.id, true); unicos.push(item); } }
            productos = unicos;
            
            showToast("⏳ Restaurando inventario y descontando deuda...");
            await respaldarInventarioEnNube();
            localStorage.setItem('mta_productos', JSON.stringify(productos));

            if(order.metodo === 'credito' && !order.pagado) {
                await enviarDatosGoogle({ action: 'cancelarCompra', correo: order.correo, totalUsd: order.totalUsd, detalles: JSON.stringify(order.items) });
            }
            localStorage.setItem('mta_global_orders', JSON.stringify(ordenesGlobales)); showToast("✅ Pedido cancelado correctamente. Abriendo WhatsApp..."); renderAdminPedidos();
            let cliente = usuariosDeLaNube.find(u => u.correo === order.correo); let telefonoCliente = cliente ? cliente.telefono : "";
            
            if(telefonoCliente) {
                telefonoCliente = telefonoCliente.replace(/\D/g, ''); 
                if (telefonoCliente.startsWith('0')) telefonoCliente = '58' + telefonoCliente.substring(1); else if (telefonoCliente.length === 10) telefonoCliente = '58' + telefonoCliente;
                let txtCancelacion = `🚫 *MATA TU ANSIEDAD - PEDIDO CANCELADO*%0A%0AHola *${order.nombres}*, te informamos que tu pedido #${order.id} ha sido cancelado.%0A%0A*Motivo:* ${motivo}%0A%0AEl saldo a deber (si aplica) ha sido ajustado. Si tienes dudas, puedes responder a este mensaje. ¡Gracias!`;
                setTimeout(() => { window.open(`https://wa.me/${telefonoCliente}?text=${txtCancelacion}`, '_blank'); }, 1500);
            } else { showToast("⚠️ El usuario no tiene un teléfono registrado para notificar por WhatsApp."); }
        }
    }
};

window.toggleAdminStatus = async (id, tipo) => {
    let order = ordenesGlobales.find(o => o.id === id);
    if(order) {
        if(tipo === 'entrega') order.entregado = !order.entregado;
        if(tipo === 'pago') {
            order.pagado = !order.pagado;
            if(order.pagado) await enviarDatosGoogle({ action: 'marcarPagado', correo: order.correo });
        }
        localStorage.setItem('mta_global_orders', JSON.stringify(ordenesGlobales)); showToast("Estado actualizado correctamente 🔄"); renderAdminPedidos();
    }
};

function renderAdminConfig() { document.getElementById('cfg-dia-1').value = diasCobroGlobales[0] || 15; document.getElementById('cfg-dia-2').value = diasCobroGlobales[1] || 30; }

window.guardarDiasCobro = () => {
    const d1 = parseInt(document.getElementById('cfg-dia-1').value); const d2 = parseInt(document.getElementById('cfg-dia-2').value);
    if(isNaN(d1) || isNaN(d2) || d1 < 1 || d1 > 31 || d2 < 1 || d2 > 31) return showToast("⚠️ Días inválidos (debe ser del 1 al 31)");
    diasCobroGlobales = [d1, d2]; localStorage.setItem('mta_dias_cobro', JSON.stringify(diasCobroGlobales)); showToast(`✅ Días de cobro actualizados al ${d1} y ${d2} del mes.`); verificarAlarmaCobro();
};

window.cerrarModales = () => { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); };
window.showToast = (msg) => { const cont = document.getElementById('toast-container'); const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg; cont.appendChild(t); setTimeout(() => t.remove(), 4000); };