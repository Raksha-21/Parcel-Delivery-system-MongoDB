// API URL
const API_URL = 'https://parcel-backend-enlb.onrender.com/api';

// Helper function to show messages
function showMessage(msg, type = 'success') {
    const msgElement = document.getElementById('message');
    if (msgElement) {
        msgElement.className = `alert alert-${type}`;
        msgElement.textContent = msg;
        msgElement.classList.remove('d-none');
        setTimeout(() => {
            msgElement.classList.add('d-none');
        }, 3000);
    }
}

// Check auth status and protect routes
function checkAuth() {
    const token = sessionStorage.getItem('token');
    const userRole = sessionStorage.getItem('userRole');
    let currentPage = window.location.pathname.split('/').pop();
    if (currentPage === '') currentPage = 'index.html'; // default to login

    const isLoginPage = currentPage === 'index.html';

    if (!token && !isLoginPage) {
        window.location.href = 'index.html';
        return;
    }

    if (token && isLoginPage) {
        redirectBasedOnRole(userRole);
        return;
    }

    // Role-based UI updates
    if (token && !isLoginPage) {
        updateNavbarForRole(userRole);
        protectCurrentPage(userRole, currentPage);
    }
}

function updateNavbarForRole(role) {
    const navItems = document.querySelectorAll('.nav-item');
    
    // Add logout button if not exists
    const navbarNav = document.getElementById('navbarNav');
    if (navbarNav && !document.getElementById('logoutBtn')) {
        const ul = navbarNav.querySelector('ul');
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `<a class="nav-link" href="#" id="logoutBtn" style="color: #ef4444;">Logout</a>`;
        ul.appendChild(li);

        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('userRole');
            sessionStorage.removeItem('userId');
            window.location.href = 'index.html';
        });
    }

    // Hide links based on role
    navItems.forEach(item => {
        const link = item.querySelector('a');
        if (!link) return;
        const href = link.getAttribute('href');
        
        if (role === 'driver') {
            if (['admin-dashboard.html', 'add-parcel.html', 'driver-management.html'].includes(href)) {
                item.style.display = 'none';
            }
        } else if (role === 'customer') {
            if (['admin-dashboard.html', 'add-parcel.html', 'parcel-list.html', 'driver-management.html'].includes(href)) {
                item.style.display = 'none';
            }
        }
    });
}

function protectCurrentPage(role, currentPage) {
    if (role === 'driver' && currentPage !== 'driver-dashboard.html') {
        window.location.href = 'driver-dashboard.html';
    } else if (role === 'customer' && currentPage !== 'customer-dashboard.html') {
        window.location.href = 'customer-dashboard.html';
    } else if (role === 'admin' && (currentPage === 'driver-dashboard.html' || currentPage === 'customer-dashboard.html')) {
        window.location.href = 'admin-dashboard.html';
    }
}

function redirectBasedOnRole(role) {
    if (role === 'admin') {
        window.location.href = 'admin-dashboard.html';
    } else if (role === 'driver') {
        window.location.href = 'driver-dashboard.html';
    } else if (role === 'customer') {
        window.location.href = 'customer-dashboard.html';
    } else {
        window.location.href = 'index.html';
    }
}

// Add token to all fetch requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    if (!config) {
        config = {};
    }
    if (!config.headers) {
        config.headers = {};
    }
    
    const token = sessionStorage.getItem('token');
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Add content type if not present and body exists
    if (!config.headers['Content-Type'] && config.body && !(config.body instanceof FormData)) {
        config.headers['Content-Type'] = 'application/json';
    }

    const response = await originalFetch(resource, config);
    let currentPage = window.location.pathname.split('/').pop();
    if (currentPage === '') currentPage = 'index.html';
    if (response.status === 401 && currentPage !== 'index.html') {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('userRole');
        window.location.href = 'index.html';
    }
    return response;
};

// Event Listeners for Login/Register pages
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            try {
                const res = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    body: JSON.stringify({ email, password })
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    sessionStorage.setItem('token', data.token);
                    sessionStorage.setItem('userRole', data.role);
                    sessionStorage.setItem('userId', data.userId);
                    redirectBasedOnRole(data.role);
                } else {
                    showMessage(data.message || 'Login failed', 'danger');
                }
            } catch (err) {
                showMessage('Server error. Please try again.', 'danger');
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('regUserId').value;
            const name = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;
            const role = document.getElementById('regRole').value;

            try {
                const res = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    body: JSON.stringify({ userId, name, email, password, role })
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    sessionStorage.setItem('token', data.token);
                    sessionStorage.setItem('userRole', data.role);
                    sessionStorage.setItem('userId', data.userId);
                    redirectBasedOnRole(data.role);
                } else {
                    showMessage(data.message || 'Registration failed', 'danger');
                }
            } catch (err) {
                showMessage('Server error. Please try again.', 'danger');
            }
        });
    }
});
