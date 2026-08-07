const express = require('express');
const nunjucks = require('nunjucks');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const cookieSession = require('cookie-session');
const PDFDocument = require('pdfkit');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = process.env.PORT || 5001;

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASS || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'vehicle_service'}`,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// String Prototypes for Python compatibility in templates
String.prototype.lower = function() {
    return this.toLowerCase();
};

String.prototype.format = function(...args) {
    let value = args[0];
    if (value === undefined || value === null) return '';
    let num = Number(value);
    if (isNaN(num)) return String(value);
    
    if (this.indexOf(':,.2f') !== -1 || this.indexOf('.2f') !== -1) {
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (this.indexOf(':,.0f') !== -1 || this.indexOf('.0f') !== -1 || this.indexOf(':,') !== -1) {
        return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return String(value);
};

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'static')));

// Stateless Cookie-based Session (matches Flask behavior for Vercel)
app.use(cookieSession({
    name: 'session',
    keys: [process.env.SECRET_KEY || 'default_nextgen_secure_key_2026'],
    maxAge: 30 * 60 * 1000 // 30 minutes
}));

// Flash messages emulation
app.use((req, res, next) => {
    res.locals.flash = req.session.flash || [];
    req.session.flash = [];
    res.locals.session = req.session;
    next();
});

const flash = (req, message) => {
    if (!req.session.flash) req.session.flash = [];
    req.session.flash.push(message);
};

// Configure Nunjucks
const env = nunjucks.configure('templates', {
    autoescape: true,
    express: app,
    noCache: true
});

// Custom Nunjucks Filters & Globals
env.addFilter('format_currency', function(num, decimals = 2) {
    if (num === undefined || num === null) return '0' + (decimals > 0 ? '.' + '0'.repeat(decimals) : '');
    let val = Number(num);
    if (isNaN(val)) return String(num);
    return val.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
});

env.addFilter('format_number', function(num) {
    if (num === undefined || num === null) return '0';
    let val = Number(num);
    if (isNaN(val)) return String(num);
    return val.toLocaleString('en-IN');
});

env.addFilter('format_date', function(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
});

env.addFilter('rejectattr', function(arr, attr, test, value) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(item => {
        let actual = item[attr];
        if (test === 'equalto') {
            return actual !== value;
        }
        return true;
    });
});

env.addFilter('selectattr', function(arr, attr, test, value) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(item => {
        let actual = item[attr];
        if (test === 'equalto') {
            return actual === value;
        }
        return false;
    });
});

env.addFilter('map', function(arr, options) {
    if (!Array.isArray(arr)) return [];
    let attr = typeof options === 'string' ? options : (options && options.attribute);
    if (!attr) return arr;
    return arr.map(item => item[attr]);
});

env.addFilter('list', function(val) {
    return Array.isArray(val) ? val : [val];
});

env.addFilter('sum', function(arr) {
    if (!Array.isArray(arr)) return 0;
    return arr.reduce((acc, val) => acc + (Number(val) || 0), 0);
});

env.addFilter('tojson', function(val) {
    return JSON.stringify(val);
});

env.addFilter('urlencode', function(val) {
    return encodeURIComponent(val);
});

env.addGlobal('url_for', function(endpoint, params) {
    if (endpoint === 'static') {
        return '/static/' + params.filename;
    }
    let url = '/' + endpoint;
    if (params) {
        if (endpoint === 'vehicle_health') {
            return `/vehicle_health/${params.vehicle_id}`;
        }
        if (endpoint === 'payment_gateway') {
            return `/payment_gateway/${params.service_id}`;
        }
        if (endpoint === 'generate_invoice') {
            return `/generate_invoice/${params.service_id}`;
        }
        if (endpoint === 'generate_job_sheet') {
            return `/generate_job_sheet/${params.service_id}`;
        }
        let searchParams = new URLSearchParams();
        for (let key in params) {
            searchParams.append(key, params[key]);
        }
        let qs = searchParams.toString();
        if (qs) {
            url += '?' + qs;
        }
    }
    return url;
});

// Password Cryptography (Werkzeug PBKDF2 & Scrypt compatibility)
function generatePasswordHash(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const iterations = 260000;
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
    return `pbkdf2:sha256:${iterations}$${salt}$${hash}`;
}

function checkPasswordHash(hashedPassword, password) {
    if (!hashedPassword) return false;
    if (!hashedPassword.includes('$')) {
        return hashedPassword === password;
    }
    const parts = hashedPassword.split('$');
    if (parts.length < 3) return false;
    
    const prefix = parts[0];
    const salt = parts[1];
    const hash = parts[2];
    
    const prefixParts = prefix.split(':');
    const algorithm = prefixParts[0];
    
    try {
        if (algorithm === 'pbkdf2') {
            const digest = prefixParts[1] || 'sha256';
            const iterations = parseInt(prefixParts[2]) || 260000;
            const keylen = hash.length / 2;
            const calculatedHash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
            return crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
        } else if (algorithm === 'scrypt') {
            const N = parseInt(prefixParts[1]) || 32768;
            const r = parseInt(prefixParts[2]) || 8;
            const p = parseInt(prefixParts[3]) || 1;
            const keylen = hash.length / 2;
            const calculatedHash = crypto.scryptSync(password, salt, keylen, { N, r, p }).toString('hex');
            return crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
        }
    } catch (e) {
        console.error('Hash check error:', e);
    }
    return false;
}

// Database Initialization & Migrations
async function initDb() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Users Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                role TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT UNIQUE,
                phone TEXT UNIQUE,
                password TEXT NOT NULL,
                specialization TEXT
            )
        `);
        await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS specialization TEXT");
        
        // Vehicles Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS vehicles (
                id SERIAL PRIMARY KEY,
                owner_id INTEGER NOT NULL,
                reg_no TEXT UNIQUE NOT NULL,
                brand TEXT NOT NULL,
                model TEXT NOT NULL,
                year INTEGER,
                engine_no TEXT,
                chassis_no TEXT,
                insurance_company TEXT,
                policy_no TEXT,
                policy_expiry TEXT,
                image_url TEXT,
                FOREIGN KEY (owner_id) REFERENCES users (id)
            )
        `);
        await client.query("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS image_url TEXT");
        await client.query("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_company TEXT");
        await client.query("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS policy_no TEXT");
        await client.query("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS policy_expiry TEXT");
        await client.query("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_mileage INTEGER DEFAULT 0");
        await client.query("ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_mileage_update TEXT");
        
        // Services Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                vehicle_id INTEGER NOT NULL,
                technician_id INTEGER,
                date TEXT NOT NULL,
                problem TEXT NOT NULL,
                request TEXT,
                status TEXT DEFAULT 'Pending',
                service_type TEXT,
                parts_details TEXT,
                parts_cost REAL DEFAULT 0,
                labor_cost REAL DEFAULT 0,
                wash_cost REAL DEFAULT 0,
                tech_commission REAL DEFAULT 0,
                center_share REAL DEFAULT 0,
                payment_status TEXT DEFAULT 'Unpaid',
                payment_method TEXT,
                rating INTEGER,
                feedback TEXT,
                FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
                FOREIGN KEY (technician_id) REFERENCES users (id)
            )
        `);
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS wash_cost REAL DEFAULT 0");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS service_type TEXT");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS tech_commission REAL DEFAULT 0");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS center_share REAL DEFAULT 0");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS rating INTEGER");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS feedback TEXT");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS is_insurance_claim BOOLEAN DEFAULT FALSE");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS claim_status TEXT");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS surveyor_name TEXT");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS damage_assessment TEXT");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS insurance_amount REAL DEFAULT 0");
        await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS customer_deductible REAL DEFAULT 0");
        
        // Emergency Requests Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS emergency_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                location TEXT NOT NULL,
                problem TEXT NOT NULL,
                status TEXT DEFAULT 'Pending',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);
        
        // Inventory Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT DEFAULT 'General',
                brand TEXT,
                compatible_model TEXT,
                description TEXT,
                price REAL NOT NULL,
                purchase_price REAL DEFAULT 0,
                stock INTEGER DEFAULT 0,
                image_url TEXT,
                is_for_sale BOOLEAN DEFAULT FALSE
            )
        `);
        await client.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS purchase_price REAL DEFAULT 0");
        await client.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General'");
        await client.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_for_sale BOOLEAN DEFAULT FALSE");
        await client.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS brand TEXT");
        await client.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS compatible_model TEXT");
        await client.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url TEXT");
        
        // Stock Purchases Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS stock_purchases (
                id SERIAL PRIMARY KEY,
                inventory_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                purchase_price REAL NOT NULL,
                total_cost REAL NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (inventory_id) REFERENCES inventory (id)
            )
        `);
        
        // Service Parts Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS service_parts (
                id SERIAL PRIMARY KEY,
                service_id INTEGER NOT NULL,
                part_id INTEGER NOT NULL,
                quantity INTEGER DEFAULT 1,
                price_at_time REAL NOT NULL,
                FOREIGN KEY (service_id) REFERENCES services (id),
                FOREIGN KEY (part_id) REFERENCES inventory (id)
            )
        `);
        
        // Settings Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);
        
        // Bundles Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS bundles (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                labor_cost REAL DEFAULT 0,
                discount_rate REAL DEFAULT 0
            )
        `);
        
        // Bundle Items Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS bundle_items (
                id SERIAL PRIMARY KEY,
                bundle_id INTEGER NOT NULL,
                part_id INTEGER NOT NULL,
                quantity INTEGER DEFAULT 1,
                FOREIGN KEY (bundle_id) REFERENCES bundles (id),
                FOREIGN KEY (part_id) REFERENCES inventory (id)
            )
        `);
        
        // Orders Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                customer_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                location TEXT NOT NULL,
                part_id INTEGER NOT NULL,
                quantity INTEGER DEFAULT 1,
                total_amount REAL NOT NULL,
                payment_method TEXT NOT NULL,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'Pending',
                FOREIGN KEY (part_id) REFERENCES inventory (id)
            )
        `);
        
        // Default Settings
        const settingsKeys = [
            ['daily_capacity', '5'],
            ['tech_commission_rate', '20'],
            ['washing_capacity', '3']
        ];
        for (let [k, v] of settingsKeys) {
            const checkSet = await client.query("SELECT * FROM settings WHERE key = $1", [k]);
            if (checkSet.rows.length === 0) {
                await client.query("INSERT INTO settings (key, value) VALUES ($1, $2)", [k, v]);
            }
        }
        
        // Default Admin
        const checkAdmin = await client.query("SELECT * FROM users WHERE role = 'admin'");
        if (checkAdmin.rows.length === 0) {
            const adminPass = generatePasswordHash('admin123');
            await client.query("INSERT INTO users (role, name, email, phone, password) VALUES ($1, $2, $3, $4, $5)",
                ['admin', 'Admin', 'admin@service.com', '0000000000', adminPass]);
        }
        
        // Seed Initial Inventory if empty
        const countRes = await client.query("SELECT COUNT(*) as count FROM inventory");
        if (parseInt(countRes.rows[0].count) === 0) {
            const parts = [
                ['Engine Oil', 'Engine', 'Premium synthetic engine oil 5W-40', 1200.0, 800.0, 50, 'https://images.unsplash.com/photo-1635816823861-512803bba221?q=80&w=800'],
                ['Brake Pads', 'Braking', 'Semi-metallic front brake pads', 850.0, 500.0, 30, 'https://images.unsplash.com/photo-1486006396193-471e6158ecfb?q=80&w=800'],
                ['Air Filter', 'Filters', 'High-flow air filter', 450.0, 300.0, 40, 'https://images.unsplash.com/photo-1621259182978-fbf93132d53d?q=80&w=800'],
                ['Oil Filter', 'Filters', 'Spin-on oil filter', 300.0, 150.0, 100, 'https://images.unsplash.com/photo-1598460671400-9883584852c0?q=80&w=800'],
                ['Spark Plug', 'Engine', 'Iridium spark plug', 350.0, 200.0, 60, 'https://images.unsplash.com/photo-1632733711679-52923aa9e170?q=80&w=800'],
                ['Battery', 'Electrical', '12V 35Ah Lead Acid Battery', 3500.0, 2500.0, 10, 'https://images.unsplash.com/photo-1620939511593-29937fd09903?q=80&w=800'],
                ['Coolant', 'Fluids', 'Engine coolant 1L', 250.0, 150.0, 25, 'https://images.unsplash.com/photo-1621259182046-2b4751421711?q=80&w=800'],
                ['Wiper Blade', 'Accessories', '20-inch wiper blade', 200.0, 100.0, 40, 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?q=80&w=800']
            ];
            
            for (let part of parts) {
                const insRes = await client.query(
                    "INSERT INTO inventory (name, category, description, price, purchase_price, stock, image_url, is_for_sale) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING id",
                    part
                );
                const newId = insRes.rows[0].id;
                await client.query(
                    "INSERT INTO stock_purchases (inventory_id, quantity, purchase_price, total_cost) VALUES ($1, $2, $3, $4)",
                    [newId, part[5], part[4], part[5] * part[4]]
                );
            }
        }
        
        // Migration: Hashing Plaintext Passwords
        const usersRes = await client.query("SELECT id, password FROM users");
        for (let user of usersRes.rows) {
            const storedPw = user.password;
            if (!storedPw.startsWith('pbkdf2:sha256:') && !storedPw.startsWith('scrypt:')) {
                const hashed = generatePasswordHash(storedPw);
                await client.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, user.id]);
            }
        }
        
        // Data Repair
        const rateRow = await client.query("SELECT value FROM settings WHERE key = 'tech_commission_rate'");
        const commissionRate = rateRow.rows.length > 0 ? parseFloat(rateRow.rows[0].value) / 100.0 : 0.20;
        await client.query(`
            UPDATE services
            SET 
                tech_commission = ROUND((labor_cost * $1)::numeric, 2),
                center_share    = ROUND(((labor_cost - labor_cost * $2) + COALESCE(parts_cost, 0) + COALESCE(wash_cost, 0))::numeric, 2)
            WHERE (tech_commission = 0 AND center_share = 0)
              AND (labor_cost > 0 OR parts_cost > 0)
        `, [commissionRate, commissionRate]);

        await client.query('COMMIT');
        console.log("Database schema, migrations and repairs completed successfully!");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Database initialization failed:", e);
    } finally {
        client.release();
    }
}

initDb();

// Load Balancer Auto Assign
async function autoAssignTechnician(serviceType) {
    try {
        let query, params;
        if (serviceType) {
            query = `
                SELECT u.id, u.name, u.specialization,
                       COUNT(s.id) as active_services
                FROM users u
                LEFT JOIN services s ON u.id = s.technician_id 
                    AND s.status NOT IN ('Completed', 'Ready for Wash', 'Washing')
                WHERE u.role = 'technician' 
                    AND (u.specialization = $1 OR u.specialization IS NULL OR u.specialization = 'General')
                GROUP BY u.id, u.name, u.specialization
                ORDER BY active_services ASC, u.id ASC
                LIMIT 1
            `;
            params = [serviceType];
        } else {
            query = `
                SELECT u.id, u.name, u.specialization,
                       COUNT(s.id) as active_services
                FROM users u
                LEFT JOIN services s ON u.id = s.technician_id 
                    AND s.status NOT IN ('Completed', 'Ready for Wash', 'Washing')
                WHERE u.role = 'technician'
                GROUP BY u.id, u.name, u.specialization
                ORDER BY active_services ASC, u.id ASC
                LIMIT 1
            `;
            params = [];
        }
        const res = await pool.query(query, params);
        return res.rows.length > 0 ? res.rows[0].id : null;
    } catch (e) {
        console.error('Error auto-assigning tech:', e);
        return null;
    }
}

// Vehicle Health Score Calculator
async function calculateVehicleHealthScore(vehicleId) {
    try {
        const vehicleRes = await pool.query(`
            SELECT v.*, u.name as owner_name
            FROM vehicles v
            JOIN users u ON v.owner_id = u.id
            WHERE v.id = $1
        `, [vehicleId]);
        
        const vehicle = vehicleRes.rows[0];
        if (!vehicle) return null;
        
        const servicesRes = await pool.query(`
            SELECT * FROM services 
            WHERE vehicle_id = $1 
            ORDER BY date DESC
        `, [vehicleId]);
        const services = servicesRes.rows;
        
        let score = 100;
        let insights = [];
        let recommendations = [];
        let healthStatus = "Excellent";
        
        // 1. Mileage Analysis
        const currentMileage = vehicle.current_mileage || 0;
        const vehicleAge = new Date().getFullYear() - (vehicle.year || new Date().getFullYear());
        
        if (vehicleAge > 0) {
            const avgYearlyMileage = currentMileage / vehicleAge;
            if (avgYearlyMileage > 20000) {
                score -= 15;
                insights.push(`⚠️ High annual mileage: ${Math.floor(avgYearlyMileage).toLocaleString()} km/year`);
                recommendations.push("Consider more frequent oil changes and brake inspections");
            } else if (avgYearlyMileage > 15000) {
                score -= 8;
                insights.push(`📊 Above average mileage: ${Math.floor(avgYearlyMileage).toLocaleString()} km/year`);
            } else {
                insights.push(`✅ Normal mileage: ${Math.floor(avgYearlyMileage).toLocaleString()} km/year`);
            }
        }
        
        // 2. Service Frequency Analysis
        if (services.length > 0) {
            const completedServices = services.filter(s => s.status === 'Completed');
            if (completedServices.length > 0) {
                const lastService = completedServices[0];
                const lastServiceDate = new Date(lastService.date);
                const daysSinceService = Math.floor((new Date() - lastServiceDate) / (1000 * 60 * 60 * 24));
                
                if (daysSinceService > 180) {
                    score -= 20;
                    insights.push(`🔴 Service overdue by ${daysSinceService - 180} days`);
                    recommendations.push("⚡ URGENT: Schedule immediate service inspection");
                } else if (daysSinceService > 150) {
                    score -= 10;
                    insights.push(`⚠️ Service due soon (${180 - daysSinceService} days remaining)`);
                    recommendations.push("Schedule service within 2 weeks");
                } else {
                    insights.push(`✅ Last serviced ${daysSinceService} days ago`);
                }
                
                if (completedServices.length >= 2) {
                    let totalInterval = 0;
                    for (let i = 0; i < Math.min(completedServices.length - 1, 4); i++) {
                        let d1 = new Date(completedServices[i].date);
                        let d2 = new Date(completedServices[i + 1].date);
                        totalInterval += Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
                    }
                    const avgInterval = totalInterval / Math.min(completedServices.length - 1, 4);
                    if (avgInterval > 210) {
                        score -= 5;
                        insights.push("⚠️ Irregular service intervals detected");
                        recommendations.push("Maintain regular 6-month service schedule");
                    }
                }
            } else {
                score -= 25;
                insights.push("🔴 No completed services found");
                recommendations.push("⚡ CRITICAL: Schedule comprehensive vehicle inspection");
            }
        } else {
            score -= 25;
            insights.push("🔴 No service history available");
            recommendations.push("⚡ CRITICAL: Complete initial vehicle assessment");
        }
        
        // 3. Repair Frequency & Severity
        const repairKeywords = ['repair', 'replace', 'fix', 'broken', 'damage', 'fault', 'issue', 'problem'];
        let repairCount = 0;
        let majorRepairs = 0;
        let totalRepairCost = 0;
        
        for (let service of services) {
            const prob = (service.problem || '').toLowerCase();
            const parts = (service.parts_details || '').toLowerCase();
            const isRepair = repairKeywords.some(kw => prob.includes(kw) || parts.includes(kw));
            
            if (isRepair) {
                repairCount++;
                const cost = (service.parts_cost || 0) + (service.labor_cost || 0);
                totalRepairCost += cost;
                if (cost > 5000) majorRepairs++;
            }
        }
        
        if (services.length > 0) {
            const repairRatio = repairCount / services.length;
            if (repairRatio > 0.6) {
                score -= 25;
                insights.push(`🔴 High repair frequency: ${repairCount}/${services.length} services`);
                recommendations.push("⚡ Consider comprehensive diagnostic check");
            } else if (repairRatio > 0.4) {
                score -= 15;
                insights.push(`⚠️ Moderate repair frequency: ${repairCount}/${services.length} services`);
                recommendations.push("Monitor vehicle closely for recurring issues");
            } else {
                insights.push(`✅ Low repair frequency: ${repairCount}/${services.length} services`);
            }
            
            if (majorRepairs > 2) {
                score -= 10;
                insights.push(`⚠️ ${majorRepairs} major repairs detected (₹5,000+)`);
                recommendations.push("Review vehicle reliability - consider upgrade if issues persist");
            }
        }
        
        // 4. Cost Analysis
        if (services.length > 0) {
            const avgServiceCost = totalRepairCost / services.length;
            if (avgServiceCost > 8000) {
                score -= 15;
                insights.push(`💰 High average service cost: ₹${Math.floor(avgServiceCost).toLocaleString()}`);
                recommendations.push("Budget for potential major maintenance");
            } else if (avgServiceCost > 5000) {
                score -= 8;
                insights.push(`💰 Above average service cost: ₹${Math.floor(avgServiceCost).toLocaleString()}`);
            } else {
                insights.push(`✅ Reasonable service cost: ₹${Math.floor(avgServiceCost).toLocaleString()}`);
            }
        }
        
        // 5. Vehicle Age Factor
        if (vehicleAge > 10) {
            score -= 10;
            insights.push(`📅 Older vehicle: ${vehicleAge} years`);
            recommendations.push("Consider preventive maintenance for aging components");
        } else if (vehicleAge > 7) {
            score -= 5;
            insights.push(`📅 Mature vehicle: ${vehicleAge} years`);
            recommendations.push("Monitor wear-prone parts closely");
        } else {
            insights.push(`✅ Vehicle age: ${vehicleAge} years`);
        }
        
        score = Math.max(0, Math.min(100, score));
        
        let statusColor = "#10b981";
        let statusIcon = "🟢";
        if (score >= 85) {
            healthStatus = "Excellent";
            statusColor = "#10b981";
            statusIcon = "🟢";
        } else if (score >= 70) {
            healthStatus = "Good";
            statusColor = "#3b82f6";
            statusIcon = "🔵";
        } else if (score >= 50) {
            healthStatus = "Fair";
            statusColor = "#f59e0b";
            statusIcon = "🟠";
        } else {
            healthStatus = "Poor";
            statusColor = "#ef4444";
            statusIcon = "🔴";
        }
        
        // Next service date calculation
        let nextServiceDate = new Date().toISOString().split('T')[0];
        if (services.length > 0 && services[0].status === 'Completed') {
            let lastDate = new Date(services[0].date);
            lastDate.setMonth(lastDate.getMonth() + 6);
            nextServiceDate = lastDate.toISOString().split('T')[0];
        }
        
        let maintenanceSuggestions = [];
        if (currentMileage > 0) {
            if (currentMileage >= 100000) {
                maintenanceSuggestions.push("🔧 Major service recommended (100k+ km)");
                maintenanceSuggestions.push("Check timing belt/chain, suspension, transmission");
            } else if (currentMileage >= 50000) {
                maintenanceSuggestions.push("🔧 Intermediate service recommended (50k+ km)");
                maintenanceSuggestions.push("Inspect brake system, coolant, spark plugs");
            } else if (currentMileage >= 20000) {
                maintenanceSuggestions.push("🔧 Standard service recommended");
                maintenanceSuggestions.push("Oil change, filter replacement, tire rotation");
            } else {
                maintenanceSuggestions.push("🔧 Basic service recommended");
                maintenanceSuggestions.push("Oil change and basic inspection");
            }
        }
        
        return {
            score: Math.round(score * 10) / 10,
            status: healthStatus,
            status_color: statusColor,
            status_icon: statusIcon,
            insights: insights,
            recommendations: recommendations,
            maintenance_suggestions: maintenanceSuggestions,
            next_service_date: nextServiceDate,
            total_services: services.length,
            repair_count: repairCount,
            current_mileage: currentMileage,
            vehicle_age: vehicleAge,
            avg_service_cost: services.length > 0 ? Math.round((totalRepairCost / services.length) * 100) / 100 : 0
        };
    } catch (e) {
        console.error('Error calculating health score:', e);
        return null;
    }
}

// ----------------- ROUTES -----------------

// Welcome Page
app.get('/', (req, res) => {
    res.render('welcome.html');
});

// Home Page
app.get('/home', async (req, res) => {
    try {
        const partsRes = await pool.query("SELECT * FROM inventory WHERE is_for_sale = TRUE AND stock > 0 ORDER BY id DESC LIMIT 4");
        const countRes = await pool.query("SELECT COUNT(*) FROM inventory WHERE is_for_sale = TRUE AND stock > 0");
        res.render('index.html', {
            parts: partsRes.rows,
            total_parts: parseInt(countRes.rows[0].count)
        });
    } catch (e) {
        console.error(e);
        res.status(500).send("Internal Server Error");
    }
});

// Shop Page
app.get('/shop', async (req, res) => {
    const { search, brand, model } = req.query;
    let query = "SELECT * FROM inventory WHERE is_for_sale = TRUE AND stock > 0";
    let params = [];
    
    if (search) {
        query += " AND (name ILIKE $1 OR description ILIKE $1)";
        params.push(`%${search}%`);
    }
    
    if (brand) {
        query += ` AND brand = $${params.length + 1}`;
        params.push(brand);
    }
    
    if (model) {
        query += ` AND compatible_model = $${params.length + 1}`;
        params.push(model);
    }
    
    try {
        const partsRes = await pool.query(query, params);
        const brandsRes = await pool.query("SELECT DISTINCT brand FROM inventory WHERE is_for_sale = TRUE AND brand IS NOT NULL");
        const modelsRes = await pool.query("SELECT DISTINCT compatible_model FROM inventory WHERE is_for_sale = TRUE AND compatible_model IS NOT NULL");
        
        res.render('shop.html', {
            parts: partsRes.rows,
            brands: brandsRes.rows.map(r => r.brand),
            models: modelsRes.rows.map(r => r.compatible_model)
        });
    } catch (e) {
        console.error(e);
        res.status(500).send("Internal Server Error");
    }
});

// Login Page
app.get('/login', (req, res) => {
    res.render('login.html');
});

app.post('/login', async (req, res) => {
    const { identifier, password, role } = req.body;
    try {
        let user;
        if (role === 'customer') {
            const userRes = await pool.query("SELECT * FROM users WHERE (email = $1 OR phone = $1) AND role = $2", [identifier, identifier, role]);
            user = userRes.rows[0];
        } else {
            if (identifier && /^\d+$/.test(identifier)) {
                const userRes = await pool.query("SELECT * FROM users WHERE (id = $1 OR email = $2) AND role = $3", [parseInt(identifier), identifier, role]);
                user = userRes.rows[0];
            } else {
                const userRes = await pool.query("SELECT * FROM users WHERE email = $1 AND role = $2", [identifier, role]);
                user = userRes.rows[0];
            }
        }
        
        if (user && checkPasswordHash(user.password, password)) {
            req.session.user_id = user.id;
            req.session.role = user.role;
            req.session.name = user.name;
            req.session.email = user.email || '';
            req.session.phone = user.phone || '';
            
            if (user.role === 'admin') {
                return res.redirect('/admin_dashboard');
            } else if (user.role === 'technician') {
                return res.redirect('/technician_dashboard');
            } else {
                return res.redirect('/customer_dashboard');
            }
        } else {
            return res.status(401).send("Invalid Credentials");
        }
    } catch (e) {
        console.error(e);
        res.status(500).send("Server Error");
    }
});

// Register Page
app.get('/register', (req, res) => {
    res.render('register.html');
});

app.post('/register', async (req, res) => {
    const { name, reg_no, phone, email, brand, model, year, engine_no, chassis_no, password } = req.body;
    
    const brandImages = {
        'Maruti Suzuki': 'https://images.unsplash.com/photo-1549490349-8643362247b5?q=80&w=800',
        'Hyundai': 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?q=80&w=800',
        'Tata Motors': 'https://images.unsplash.com/photo-1603386329225-868f9b1ee6c9?q=80&w=800',
        'Mahindra': 'https://images.unsplash.com/photo-1620608146313-2df67cc85766?q=80&w=800',
        'Toyota': 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=800',
        'Honda': 'https://gtrentals.ph/wp-content/uploads/2019/07/9c7c10d2dcf1e4a7fc35454327f208c719a27d3225175-scaled.jpg',
        'BMW': 'https://images.unsplash.com/photo-1555215695-3004980ad54e?q=80&w=800',
        'Skoda': 'https://images.unsplash.com/photo-1594541818129-417d4722a84a?q=80&w=800',
        'Kia': 'https://images.unsplash.com/photo-1632243193044-8e979827d52b?q=80&w=800',
        'Volkswagen': 'https://images.overdrive.in/wp-content/odgallery/2021/06/59561_2021_Volkswagen_polo.jpg',
        'Renault': 'https://images.unsplash.com/photo-1613134268686-235b2e5cc8f2?q=80&w=800',
        'Audi': 'https://images.unsplash.com/photo-1606152421631-f22758296719?q=80&w=800',
        'Mercedes-Benz': 'https://images.unsplash.com/photo-1618843479313-4b88afaa5e6c?q=80&w=800'
    };
    const imageUrl = brandImages[brand] || 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=800';
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const hashedPw = generatePasswordHash(password);
        
        const userInsert = await client.query(
            "INSERT INTO users (role, name, email, phone, password) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            ['customer', name, email, phone, hashedPw]
        );
        const userId = userInsert.rows[0].id;
        
        await client.query(
            "INSERT INTO vehicles (owner_id, reg_no, brand, model, year, engine_no, chassis_no, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [userId, reg_no, brand, model, parseInt(year) || null, engine_no, chassis_no, imageUrl]
        );
        
        await client.query('COMMIT');
        res.redirect('/login');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(400).send(`Error: ${e.message}`);
    } finally {
        client.release();
    }
});

// Customer Dashboard
app.get('/customer_dashboard', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'customer') {
        return res.redirect('/login');
    }
    
    try {
        const vehiclesRes = await pool.query("SELECT * FROM vehicles WHERE owner_id = $1", [req.session.user_id]);
        const myVehicles = vehiclesRes.rows;
        const reminders = [];
        
        for (let v of myVehicles) {
            const lastServiceRes = await pool.query(
                "SELECT date FROM services WHERE vehicle_id = $1 AND status = 'Completed' ORDER BY date DESC LIMIT 1",
                [v.id]
            );
            const lastService = lastServiceRes.rows[0];
            if (lastService) {
                let lastDate = new Date(lastService.date);
                lastDate.setMonth(lastDate.getMonth() + 6);
                
                const daysLeft = Math.ceil((lastDate - new Date()) / (1000 * 60 * 60 * 24));
                if (daysLeft <= 15) {
                    reminders.push({
                        reg_no: v.reg_no,
                        due_date: lastDate.toISOString().split('T')[0],
                        is_overdue: daysLeft < 0
                    });
                }
            }
        }
        
        const historyRes = await pool.query(`
            SELECT services.*, vehicles.reg_no, vehicles.brand, vehicles.model, vehicles.image_url, users.name as tech_name 
            FROM services 
            JOIN vehicles ON services.vehicle_id = vehicles.id 
            LEFT JOIN users ON services.technician_id = users.id 
            WHERE vehicles.owner_id = $1 
            ORDER BY services.id DESC
        `, [req.session.user_id]);
        
        res.render('customer_dashboard.html', {
            history: historyRes.rows,
            vehicles: myVehicles,
            reminders: reminders
        });
    } catch (e) {
        console.error(e);
        res.status(500).send("Error rendering dashboard");
    }
});

// Export History
app.get('/export_history', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    
    try {
        let rows, headers;
        if (req.session.role === 'admin') {
            const resData = await pool.query(`
                SELECT s.date, v.reg_no, v.brand, v.model, u.name as owner, s.problem, s.status, s.parts_cost + s.labor_cost as total
                FROM services s
                JOIN vehicles v ON s.vehicle_id = v.id
                JOIN users u ON v.owner_id = u.id
            `);
            rows = resData.rows;
            headers = ['Date', 'Vehicle No', 'Brand', 'Model', 'Owner', 'Problem', 'Status', 'Total Amount (₹)'];
        } else {
            const resData = await pool.query(`
                SELECT s.date, v.reg_no, v.brand, v.model, s.problem, s.status, s.parts_cost + s.labor_cost as total
                FROM services s
                JOIN vehicles v ON s.vehicle_id = v.id
                WHERE v.owner_id = $1
            `, [req.session.user_id]);
            rows = resData.rows;
            headers = ['Date', 'Vehicle No', 'Brand', 'Model', 'Problem', 'Status', 'Total Amount (₹)'];
        }
        
        const escapeCSV = (val) => {
            if (val === null || val === undefined) return '';
            let str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                str = '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };
        
        let csvContent = headers.map(escapeCSV).join(',') + '\n';
        for (let row of rows) {
            csvContent += Object.values(row).map(escapeCSV).join(',') + '\n';
        }
        
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        res.setHeader('Content-Disposition', `attachment; filename=service_history_${dateStr}.csv`);
        res.setHeader('Content-Type', 'text/csv');
        res.send(csvContent);
    } catch (e) {
        console.error(e);
        res.status(500).send("CSV export failed");
    }
});

// Book Service
app.post('/book_service', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    
    const { vehicle_id, date, problem, request: request_text, service_type } = req.body;
    const is_insurance = req.body.is_insurance === 'on';
    const claim_status = is_insurance ? 'Pending' : null;
    
    try {
        const assigned_tech_id = await autoAssignTechnician(service_type || 'General');
        const status = assigned_tech_id ? 'Assigned' : 'Pending';
        
        await pool.query(`
            INSERT INTO services (vehicle_id, date, problem, request, service_type, technician_id, status, is_insurance_claim, claim_status) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [vehicle_id, date, problem, request_text, service_type || 'General', assigned_tech_id, status, is_insurance, claim_status]);
        
        res.redirect('/customer_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Booking failed");
    }
});

// Update Insurance Info
app.post('/update_insurance', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    const { vehicle_id, insurance_company, policy_no, policy_expiry } = req.body;
    
    try {
        await pool.query(`
            UPDATE vehicles 
            SET insurance_company = $1, policy_no = $2, policy_expiry = $3 
            WHERE id = $4 AND owner_id = $5
        `, [insurance_company, policy_no, policy_expiry, vehicle_id, req.session.user_id]);
        res.redirect('/customer_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Insurance update failed");
    }
});

// Update Insurance Claim (Admin)
app.post('/update_claim', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') return res.redirect('/login');
    const { service_id, claim_status, surveyor_name, insurance_amount, customer_deductible } = req.body;
    
    try {
        await pool.query(`
            UPDATE services 
            SET claim_status = $1, surveyor_name = $2, insurance_amount = $3, customer_deductible = $4 
            WHERE id = $5
        `, [claim_status, surveyor_name, parseFloat(insurance_amount) || 0, parseFloat(customer_deductible) || 0, service_id]);
        res.redirect('/admin_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Claim update failed");
    }
});

// Emergency Alert
app.post('/emergency', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    const { location, problem } = req.body;
    
    try {
        await pool.query(
            "INSERT INTO emergency_requests (user_id, location, problem) VALUES ($1, $2, $3)",
            [req.session.user_id, location, problem]
        );
        res.redirect('/customer_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Emergency alert logging failed");
    }
});

// Technician Dashboard
app.get('/technician_dashboard', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'technician') {
        return res.redirect('/login');
    }
    
    try {
        const tasksRes = await pool.query(`
            SELECT services.*, vehicles.reg_no, vehicles.brand, vehicles.model, vehicles.image_url, users.name as owner_name, users.phone as owner_phone 
            FROM services 
            JOIN vehicles ON services.vehicle_id = vehicles.id 
            JOIN users ON vehicles.owner_id = users.id 
            WHERE services.status NOT IN ('Completed', 'Ready for Wash', 'Washing')
            AND services.technician_id = $1
            ORDER BY services.date ASC
        `, [req.session.user_id]);
        
        const recRes = await pool.query(`
            SELECT SUM(tech_commission) as total_earnings,
                   SUM(parts_cost + labor_cost) as total_generated
            FROM services 
            WHERE technician_id = $1 AND status = 'Completed'
        `, [req.session.user_id]);
        const rec = recRes.rows[0];
        
        const countRes = await pool.query("SELECT COUNT(*) as count FROM services WHERE technician_id = $1 AND status = 'Completed'", [req.session.user_id]);
        const completedCount = countRes.rows[0].count;
        
        const ratingRes = await pool.query("SELECT AVG(rating) as avg_rating, COUNT(rating) as rating_count FROM services WHERE technician_id = $1 AND rating IS NOT NULL", [req.session.user_id]);
        const ratingData = ratingRes.rows[0];
        
        const feedbacksRes = await pool.query(`
            SELECT s.feedback, s.rating, v.reg_no, u.name as owner_name, s.date
            FROM services s
            JOIN vehicles v ON s.vehicle_id = v.id
            JOIN users u ON v.owner_id = u.id
            WHERE s.technician_id = $1 AND s.rating IS NOT NULL
            ORDER BY s.id DESC LIMIT 5
        `, [req.session.user_id]);
        
        const inventoryRes = await pool.query("SELECT * FROM inventory WHERE stock > 0");
        const commRateRes = await pool.query("SELECT value FROM settings WHERE key = 'tech_commission_rate'");
        
        res.render('technician_dashboard.html', {
            tasks: tasksRes.rows,
            inventory: inventoryRes.rows,
            statuses: ["Pending", "Assigned", "Inspecting", "In Service", "Quality Check"],
            total_revenue: parseFloat(rec.total_earnings) || 0,
            total_generated: parseFloat(rec.total_generated) || 0,
            completed_count: parseInt(completedCount),
            tech_commission_rate: commRateRes.rows[0].value,
            avg_rating: ratingData.avg_rating ? Math.round(parseFloat(ratingData.avg_rating) * 10) / 10 : 0,
            rating_count: parseInt(ratingData.rating_count),
            feedbacks: feedbacksRes.rows
        });
    } catch (e) {
        console.error(e);
        res.status(500).send("Error loading technician dashboard");
    }
});

// Update Status (Technician)
app.post('/update_status', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'technician') return res.redirect('/login');
    const { service_id, status } = req.body;
    
    try {
        await pool.query(
            "UPDATE services SET status = $1, technician_id = $2 WHERE id = $3",
            [status, req.session.user_id, service_id]
        );
        flash(req, 'Status Updated Successfully! ✅');
        res.redirect('/technician_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Status update failed");
    }
});

// Update Service (Generate Bill / Complete Job)
app.post('/update_service', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'technician') return res.redirect('/login');
    
    const { service_id, parts_details, misc_cost, hours, wash_cost, part_ids, damage_assessment } = req.body;
    const laborRate = 500;
    const laborCost = (parseFloat(hours) || 0) * laborRate;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        let totalPartsCost = parseFloat(misc_cost) || 0;
        let inventoryDetails = "";
        
        const partIdsArr = Array.isArray(part_ids) ? part_ids : (part_ids ? [part_ids] : []);
        for (let p_id of partIdsArr) {
            const qtyRaw = req.body[`qty_${p_id}`];
            const qty = parseInt(qtyRaw) || 0;
            if (qty > 0) {
                const partRes = await client.query("SELECT * FROM inventory WHERE id = $1", [p_id]);
                const part = partRes.rows[0];
                if (part) {
                    const cost = part.price * qty;
                    totalPartsCost += cost;
                    await client.query(
                        "INSERT INTO service_parts (service_id, part_id, quantity, price_at_time) VALUES ($1, $2, $3, $4)",
                        [service_id, p_id, qty, part.price]
                    );
                    await client.query(
                        "UPDATE inventory SET stock = stock - $1 WHERE id = $2",
                        [qty, p_id]
                    );
                    inventoryDetails += `\n• ${part.name} (x${qty})`;
                }
            }
        }
        
        const rateRes = await client.query("SELECT value FROM settings WHERE key = 'tech_commission_rate'");
        const rate = parseInt(rateRes.rows[0].value) / 100;
        const techCommission = laborCost * rate;
        const centerShare = (laborCost - techCommission) + totalPartsCost + (parseFloat(wash_cost) || 0);
        
        const finalPartsDetails = (parts_details || "") + inventoryDetails;
        
        await client.query(`
            UPDATE services 
            SET parts_details = $1, parts_cost = $2, labor_cost = $3, wash_cost = $4,
                tech_commission = $5, center_share = $6, 
                technician_id = $7, status = 'Completed',
                damage_assessment = $8
            WHERE id = $9
        `, [finalPartsDetails, totalPartsCost, laborCost, parseFloat(wash_cost) || 0, techCommission, centerShare, req.session.user_id, damage_assessment || null, service_id]);
        
        await client.query('COMMIT');
        flash(req, 'Job Completed and Bill Generated! ✅');
        res.redirect('/technician_dashboard');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).send("Service job billing failed");
    } finally {
        client.release();
    }
});

// Move to Wash Bay
app.post('/move_to_wash', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'technician') return res.redirect('/login');
    const { service_id } = req.body;
    try {
        await pool.query("UPDATE services SET status = 'Ready for Wash' WHERE id = $1", [service_id]);
        flash(req, 'Vehicle moved to Washing Bay! ✅');
        res.redirect('/technician_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Action failed");
    }
});

// Admin Dashboard
app.get('/admin_dashboard', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') {
        return res.redirect('/login');
    }
    
    try {
        const customersRes = await pool.query("SELECT * FROM users WHERE role = 'customer'");
        const commRateRes = await pool.query("SELECT value FROM settings WHERE key = 'tech_commission_rate'");
        const techCommissionRate = commRateRes.rows[0]?.value || '20';
        
        const techniciansRes = await pool.query(`
            SELECT u.*, 
                   COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.parts_cost + s.labor_cost ELSE 0 END), 0) as total_revenue,
                   COUNT(CASE WHEN s.status = 'Completed' THEN 1 END) as completed_jobs,
                   COUNT(CASE WHEN s.status NOT IN ('Completed', 'Ready for Wash', 'Washing') THEN 1 END) as active_services
            FROM users u
            LEFT JOIN services s ON u.id = s.technician_id
            WHERE u.role = 'technician'
            GROUP BY u.id
        `);
        
        const emergenciesRes = await pool.query("SELECT emergency_requests.*, users.name FROM emergency_requests JOIN users ON emergency_requests.user_id = users.id");
        
        const offlineRequestsRes = await pool.query(`
            SELECT services.*, vehicles.reg_no, vehicles.brand, vehicles.image_url, users.name as owner_name, users.phone as owner_phone, users.email as owner_email
            FROM services 
            JOIN vehicles ON services.vehicle_id = vehicles.id 
            JOIN users ON vehicles.owner_id = users.id 
            WHERE payment_status = 'Unpaid' AND payment_method = 'offline'
        `);
        
        const feedbacksRes = await pool.query(`
            SELECT services.*, vehicles.reg_no, vehicles.brand, vehicles.image_url, users.name as owner_name, tech.name as tech_name
            FROM services 
            JOIN vehicles ON services.vehicle_id = vehicles.id 
            JOIN users ON vehicles.owner_id = users.id 
            LEFT JOIN users as tech ON services.technician_id = tech.id
            WHERE rating IS NOT NULL
            ORDER BY id DESC
        `);
        
        const serviceRevRes = await pool.query(`
            SELECT SUM(CASE 
                WHEN is_insurance_claim = TRUE THEN COALESCE(insurance_amount, 0) + COALESCE(customer_deductible, 0)
                ELSE COALESCE(parts_cost, 0) + COALESCE(labor_cost, 0) + COALESCE(wash_cost, 0)
            END) as service_revenue 
            FROM services 
            WHERE payment_status = 'Paid'
        `);
        const serviceRevenue = parseFloat(serviceRevRes.rows[0].service_revenue) || 0;
        
        const salesRevRes = await pool.query("SELECT SUM(total_amount) as sales_revenue FROM orders WHERE status != 'Cancelled'");
        const salesRevenue = parseFloat(salesRevRes.rows[0].sales_revenue) || 0;
        
        const grossRevenue = serviceRevenue + salesRevenue;
        
        const expensesRes = await pool.query("SELECT SUM(total_cost) as total_expenses FROM stock_purchases");
        const totalExpenses = parseFloat(expensesRes.rows[0].total_expenses) || 0;
        
        const netRevenue = grossRevenue - totalExpenses;
        
        const completedServicesRes = await pool.query(`
            SELECT services.*, vehicles.reg_no, users.name as owner_name, 
                   users.phone as owner_phone, users.email as owner_email,
                   tech.name as tech_name, tech.phone as tech_phone, tech.email as tech_email,
                   (CASE 
                        WHEN is_insurance_claim = TRUE THEN COALESCE(services.insurance_amount, 0) + COALESCE(services.customer_deductible, 0)
                        ELSE COALESCE(services.parts_cost, 0) + COALESCE(services.labor_cost, 0) + COALESCE(services.wash_cost, 0)
                    END) as row_total
            FROM services 
            JOIN vehicles ON services.vehicle_id = vehicles.id 
            JOIN users ON vehicles.owner_id = users.id 
            LEFT JOIN users as tech ON services.technician_id = tech.id
            WHERE services.payment_status = 'Paid'
            ORDER BY services.id DESC
        `);
        
        const allInventoryRes = await pool.query("SELECT * FROM inventory ORDER BY category, name");
        const inventoryItems = {};
        for (let item of allInventoryRes.rows) {
            const cat = item.category || 'General';
            if (!inventoryItems[cat]) inventoryItems[cat] = [];
            inventoryItems[cat].push(item);
        }
        
        // Overdue Alerts
        const allVehiclesRes = await pool.query("SELECT id, reg_no, owner_id FROM vehicles");
        const overdueAlerts = [];
        for (let v of allVehiclesRes.rows) {
            const lastSRes = await pool.query("SELECT date FROM services WHERE vehicle_id = $1 AND status = 'Completed' ORDER BY date DESC LIMIT 1", [v.id]);
            const lastS = lastSRes.rows[0];
            if (lastS) {
                let lastDate = new Date(lastS.date);
                lastDate.setMonth(lastDate.getMonth() + 6);
                if (lastDate < new Date()) {
                    const ownerRes = await pool.query("SELECT name, phone FROM users WHERE id = $1", [v.owner_id]);
                    const owner = ownerRes.rows[0];
                    overdueAlerts.push({
                        reg_no: v.reg_no,
                        owner: owner.name,
                        phone: owner.phone,
                        due_since: lastDate.toISOString().split('T')[0]
                    });
                }
            }
        }
        
        const payoutDataRes = await pool.query("SELECT SUM(tech_commission) as total_payouts, SUM(center_share) as total_shares FROM services WHERE payment_status = 'Paid'");
        const totalTechPayouts = parseFloat(payoutDataRes.rows[0].total_payouts) || 0;
        const totalCenterShares = parseFloat(payoutDataRes.rows[0].total_shares) || 0;
        
        const washQueueRes = await pool.query(`
            SELECT services.*, vehicles.reg_no, vehicles.brand, vehicles.image_url, users.name as owner_name 
            FROM services 
            JOIN vehicles ON services.vehicle_id = vehicles.id 
            JOIN users ON vehicles.owner_id = users.id 
            WHERE services.status IN ('Ready for Wash', 'Washing')
        `);
        
        const serviceQueueRes = await pool.query(`
            SELECT services.*, vehicles.reg_no, vehicles.brand, vehicles.image_url, users.name as owner_name, users.phone as owner_phone
            FROM services 
            JOIN vehicles ON services.vehicle_id = vehicles.id 
            JOIN users ON vehicles.owner_id = users.id 
            WHERE services.status IN ('Pending', 'Scheduled')
            ORDER BY services.date ASC
        `);
        
        const ordersRes = await pool.query(`
            SELECT orders.*, inventory.name as part_name, inventory.brand
            FROM orders
            JOIN inventory ON orders.part_id = inventory.id
            ORDER BY orders.date DESC
        `);
        
        const insuranceClaimsRes = await pool.query(`
            SELECT services.*, vehicles.reg_no, users.name as owner_name, users.phone as owner_phone, users.email as owner_email,
                   vehicles.insurance_company, vehicles.policy_no, tech.name as tech_name
            FROM services 
            JOIN vehicles ON services.vehicle_id = vehicles.id 
            JOIN users ON vehicles.owner_id = users.id 
            LEFT JOIN users as tech ON services.technician_id = tech.id
            WHERE is_insurance_claim = TRUE
            ORDER BY services.id DESC
        `);
        
        // Enhanced Revenue Analytics for Chart
        const chartRes = await pool.query(`
            WITH daily_services AS (
                SELECT 
                    date, 
                    SUM(CASE WHEN is_insurance_claim = TRUE THEN 0 ELSE labor_cost END) as labor,
                    SUM(CASE 
                        WHEN is_insurance_claim = TRUE THEN COALESCE(insurance_amount, 0) + COALESCE(customer_deductible, 0) 
                        ELSE COALESCE(parts_cost, 0) 
                    END) as parts,
                    SUM(CASE WHEN is_insurance_claim = TRUE THEN 0 ELSE wash_cost END) as wash
                FROM services WHERE payment_status = 'Paid'
                GROUP BY date
            ),
            daily_orders AS (
                SELECT CAST(date AS DATE) as date, SUM(total_amount) as amount
                FROM orders
                WHERE status != 'Cancelled'
                GROUP BY CAST(date AS DATE)
            )
            SELECT 
                COALESCE(s.date, CAST(o.date AS TEXT)) as rev_date,
                COALESCE(s.labor, 0) as labor,
                COALESCE(s.parts, 0) as service_parts,
                COALESCE(s.wash, 0) as wash,
                COALESCE(o.amount, 0) as direct_sales,
                (COALESCE(s.labor, 0) + COALESCE(s.parts, 0) + COALESCE(s.wash, 0) + COALESCE(o.amount, 0)) as total
            FROM daily_services s
            FULL OUTER JOIN daily_orders o ON s.date = CAST(o.date AS TEXT)
            ORDER BY rev_date DESC 
            LIMIT 30
        `);
        
        const analytics = chartRes.rows;
        const reversedAnalytics = [...analytics].reverse();
        const chartData = {
            labels: reversedAnalytics.map(r => r.rev_date),
            total: reversedAnalytics.map(r => parseFloat(r.total)),
            labor: reversedAnalytics.map(r => parseFloat(r.labor)),
            parts: reversedAnalytics.map(r => parseFloat(r.service_parts) + parseFloat(r.direct_sales)),
            wash: reversedAnalytics.map(r => parseFloat(r.wash))
        };
        
        res.render('admin_dashboard.html', {
            customers: customersRes.rows,
            technicians: techniciansRes.rows,
            emergencies: emergenciesRes.rows,
            offline_requests: offlineRequestsRes.rows,
            feedbacks: feedbacksRes.rows,
            gross_revenue: grossRevenue,
            total_expenses: totalExpenses,
            total_revenue: netRevenue,
            total_tech_payouts: totalTechPayouts,
            total_center_shares: totalCenterShares,
            wash_queue: washQueueRes.rows,
            completed_services: completedServicesRes.rows,
            inventory_items: inventoryItems,
            overdue_alerts: overdueAlerts,
            orders: ordersRes.rows,
            analytics_json: chartData,
            insurance_claims: insuranceClaimsRes.rows,
            tech_commission_rate: techCommissionRate,
            service_queue: serviceQueueRes.rows
        });
    } catch (e) {
        console.error(e);
        res.status(500).send("Error loading admin dashboard");
    }
});

// Feedback Submission
app.post('/submit_feedback', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'customer') return res.redirect('/login');
    const { service_id, rating, feedback } = req.body;
    
    try {
        await pool.query(
            "UPDATE services SET rating = $1, feedback = $2 WHERE id = $3",
            [parseInt(rating), feedback, service_id]
        );
        flash(req, 'Thank you for your feedback! ⭐');
        res.redirect('/customer_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Feedback submission failed");
    }
});

// Update Commission Rate
app.post('/update_commission', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') return res.redirect('/login');
    const { commission_rate } = req.body;
    
    if (commission_rate) {
        try {
            await pool.query("UPDATE settings SET value = $1 WHERE key = 'tech_commission_rate'", [commission_rate]);
        } catch (e) {
            console.error(e);
        }
    }
    res.redirect('/admin_dashboard');
});

// Update Inventory
app.post('/update_inventory', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') return res.redirect('/login');
    const { item_id, name, category, brand, model, image_url, price, purchase_price, stock } = req.body;
    const is_for_sale = req.body.is_for_sale === 'true' || req.body.is_for_sale === 'on';
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        if (item_id) {
            const oldRes = await client.query("SELECT stock FROM inventory WHERE id = $1", [item_id]);
            const oldStock = oldRes.rows[0]?.stock || 0;
            
            await client.query(`
                UPDATE inventory 
                SET name = $1, category = $2, brand = $3, compatible_model = $4, price = $5, purchase_price = $6, stock = $7, is_for_sale = $8, image_url = $9 
                WHERE id = $10
            `, [name, category || 'General', brand || 'Universal', model || 'All', parseFloat(price) || 0, parseFloat(purchase_price) || 0, parseInt(stock) || 0, is_for_sale, image_url, item_id]);
            
            const newStock = parseInt(stock) || 0;
            if (newStock > oldStock) {
                const addedQty = newStock - oldStock;
                const cost = parseFloat(purchase_price) || 0;
                await client.query(
                    "INSERT INTO stock_purchases (inventory_id, quantity, purchase_price, total_cost) VALUES ($1, $2, $3, $4)",
                    [item_id, addedQty, cost, addedQty * cost]
                );
            }
        } else {
            const insRes = await client.query(`
                INSERT INTO inventory (name, category, brand, compatible_model, price, purchase_price, stock, is_for_sale, image_url) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
            `, [name, category || 'General', brand || 'Universal', model || 'All', parseFloat(price) || 0, parseFloat(purchase_price) || 0, parseInt(stock) || 0, is_for_sale, image_url]);
            
            const newId = insRes.rows[0].id;
            const newStock = parseInt(stock) || 0;
            if (newStock > 0) {
                const cost = parseFloat(purchase_price) || 0;
                await client.query(
                    "INSERT INTO stock_purchases (inventory_id, quantity, purchase_price, total_cost) VALUES ($1, $2, $3, $4)",
                    [newId, newStock, cost, newStock * cost]
                );
            }
        }
        
        await client.query('COMMIT');
        res.redirect('/admin_dashboard');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).send("Inventory update failed");
    } finally {
        client.release();
    }
});

// Delete Inventory
app.get('/delete_inventory/:item_id', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') return res.redirect('/login');
    const { item_id } = req.params;
    
    try {
        await pool.query("DELETE FROM inventory WHERE id = $1", [item_id]);
        res.redirect('/admin_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Delete inventory failed");
    }
});

// Create Technician Account
app.post('/create_technician', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') return res.redirect('/login');
    const { name, email, phone, password, specialization } = req.body;
    
    try {
        const hashedPw = generatePasswordHash(password);
        await pool.query(
            "INSERT INTO users (role, name, email, phone, password, specialization) VALUES ($1, $2, $3, $4, $5, $6)",
            ['technician', name, email, phone, hashedPw, specialization || 'General']
        );
        res.redirect('/admin_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Failed to create technician");
    }
});

// Update Wash Bay Status
app.post('/update_wash_status', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') return res.redirect('/login');
    let { service_id, status } = req.body;
    
    if (status === 'Completed') status = 'Washed';
    
    try {
        await pool.query("UPDATE services SET status = $1 WHERE id = $2", [status, service_id]);
        res.redirect('/admin_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Update wash status failed");
    }
});

// Resolve Emergency Alert
app.get('/resolve_emergency/:id', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') return res.redirect('/login');
    const { id } = req.params;
    
    try {
        await pool.query("DELETE FROM emergency_requests WHERE id = $1", [id]);
        res.redirect('/admin_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Failed to resolve emergency");
    }
});

// Process Pay Status request (confirm payment offline or redirect online)
app.post('/pay', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    const { service_id, method } = req.body;
    
    if (method === 'online') {
        return res.redirect(`/payment_gateway/${service_id}`);
    }
    
    try {
        await pool.query("UPDATE services SET payment_method = 'offline' WHERE id = $1", [service_id]);
        flash(req, 'Cash collection request sent successfully.');
        res.redirect('/customer_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Settlement request failed");
    }
});

// Payment Gateway Gateway Screen
app.get('/payment_gateway/:service_id', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    const { service_id } = req.params;
    
    try {
        const serviceRes = await pool.query(`
            SELECT s.*, v.brand, v.model, v.reg_no 
            FROM services s 
            JOIN vehicles v ON s.vehicle_id = v.id 
            WHERE s.id = $1
        `, [service_id]);
        const service = serviceRes.rows[0];
        
        if (!service) return res.status(404).send("Service record not found");
        
        const totalAmount = service.parts_cost + service.labor_cost + (service.wash_cost || 0);
        
        // UPI Details
        const vpa = "pkishore2007tnj@oksbi";
        const merchantName = "NextGen AutoCare";
        const bankName = "CANARA BANK";
        const upiPhone = "9944383845";
        
        const encodedName = merchantName.replace(/ /g, '%20');
        const upiLink = `upi://pay?pa=${vpa}&pn=${encodedName}&am=${totalAmount.toFixed(2)}&cu=INR&tn=NextGen_AutoCare_${service.id}`;
        
        res.render('payment_gateway.html', {
            service: service,
            total: totalAmount,
            upi_link: upiLink,
            upi_id: vpa,
            upi_phone: upiPhone,
            bank: bankName
        });
    } catch (e) {
        console.error(e);
        res.status(500).send("Payment gateway load failed");
    }
});

// Confirm Online Payment
app.post('/confirm_payment/:service_id', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    const { service_id } = req.params;
    const { transaction_id } = req.body;
    
    try {
        const paymentNote = `Online (UTR: ${transaction_id})`;
        await pool.query(`
            UPDATE services 
            SET payment_status = 'Paid', 
                payment_method = $1 
            WHERE id = $2
        `, [paymentNote, service_id]);
        
        flash(req, 'Payment confirmed! Thank you for choosing NextGen AutoCare.');
        res.redirect('/customer_dashboard');
    } catch (e) {
        console.error(e);
        res.status(500).send("Payment confirmation failed");
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
});

// Generate PDF Invoice
app.get('/generate_invoice/:service_id', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    const { service_id } = req.params;
    
    try {
        const serviceRes = await pool.query(`
            SELECT s.*, v.reg_no, v.brand, v.model, u.name as owner_name, u.phone, u.email,
                   tech.name as tech_name
            FROM services s
            JOIN vehicles v ON s.vehicle_id = v.id
            JOIN users u ON v.owner_id = u.id
            LEFT JOIN users as tech ON s.technician_id = tech.id
            WHERE s.id = $1
        `, [service_id]);
        const service = serviceRes.rows[0];
        
        if (!service) return res.status(404).send("Service record not found");
        
        const partsRes = await pool.query(`
            SELECT sp.*, i.name 
            FROM service_parts sp
            JOIN inventory i ON sp.part_id = i.id
            WHERE sp.service_id = $1
        `, [service_id]);
        
        // Generate PDF
        const doc = new PDFDocument({ size: 'A4', margin: 20 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice_${service.reg_no}.pdf`);
        doc.pipe(res);
        
        // Header
        doc.fillColor('#1e293b').fontSize(24).font('Helvetica-Bold').text('NextGen AutoCare', 20, 20);
        doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('PROFESSIONAL AUTOMOTIVE CENTER', 20, 48);
        doc.fillColor('#1e293b').fontSize(16).font('Helvetica-Bold').text('INVOICE', 400, 20, { align: 'right' });
        doc.moveDown(2);
        
        doc.moveTo(20, 70).lineTo(575, 70).strokeColor('#e2e8f0').lineWidth(1).stroke();
        
        // Boxes
        doc.rect(20, 80, 555, 75).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        
        // Info text
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text('CLIENT DETAILS', 25, 90);
        doc.fontSize(10).fillColor('#000000').font('Helvetica').text(`${service.owner_name}\n${service.phone}\n${service.email}`, 25, 105, { lineGap: 4 });
        
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text('VEHICLE PROFILE', 225, 90);
        doc.fontSize(10).fillColor('#000000').font('Helvetica').text(`${service.brand} ${service.model}\nReg: ${service.reg_no}\nType: ${service.service_type || 'General'}`, 225, 105, { lineGap: 4 });
        
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text('ORDER SUMMARY', 425, 90);
        const invoiceId = `INV-${String(service.id).padStart(5, '0')}`;
        doc.fontSize(10).fillColor('#000000').font('Helvetica').text(`ID: #${invoiceId}\nDate: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}\nStatus: ${service.payment_status}`, 425, 105, { lineGap: 4 });
        
        // Table Headers
        const startY = 180;
        doc.rect(20, startY, 555, 20).fill('#1e293b');
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('CARE DESCRIPTION', 25, startY + 5);
        doc.text('QTY', 320, startY + 5);
        doc.text('UNIT PRICE', 400, startY + 5);
        doc.text('TOTAL', 500, startY + 5);
        
        let currentY = startY + 20;
        
        // Labor
        doc.fillColor('#000000').fontSize(9).font('Helvetica').text('Labor and Troubleshooting', 25, currentY + 5);
        doc.text('1', 320, currentY + 5);
        doc.text(`Rs. ${(service.labor_cost || 0).toLocaleString()}`, 400, currentY + 5);
        doc.text(`Rs. ${(service.labor_cost || 0).toLocaleString()}`, 500, currentY + 5);
        doc.rect(20, currentY, 555, 20).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        currentY += 20;
        
        // Wash
        if (service.wash_cost > 0) {
            doc.fillColor('#000000').fontSize(9).font('Helvetica').text('Premium Vehicle Wash', 25, currentY + 5);
            doc.text('1', 320, currentY + 5);
            doc.text(`Rs. ${(service.wash_cost || 0).toLocaleString()}`, 400, currentY + 5);
            doc.text(`Rs. ${(service.wash_cost || 0).toLocaleString()}`, 500, currentY + 5);
            doc.rect(20, currentY, 555, 20).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            currentY += 20;
        }
        
        // Parts
        for (let part of partsRes.rows) {
            let partTotal = part.price_at_time * part.quantity;
            doc.fillColor('#000000').fontSize(9).font('Helvetica').text(part.name, 25, currentY + 5);
            doc.text(String(part.quantity), 320, currentY + 5);
            doc.text(`Rs. ${part.price_at_time.toLocaleString()}`, 400, currentY + 5);
            doc.text(`Rs. ${partTotal.toLocaleString()}`, 500, currentY + 5);
            doc.rect(20, currentY, 555, 20).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            currentY += 20;
        }
        
        // Grand Total
        const totalVal = (service.parts_cost || 0) + (service.labor_cost || 0) + (service.wash_cost || 0);
        doc.moveDown(2);
        doc.fillColor('#4f46e5').fontSize(16).font('Helvetica-Bold').text(`GRAND TOTAL: Rs. ${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, currentY + 30, { align: 'right' });
        
        doc.end();
    } catch (e) {
        console.error(e);
        res.status(500).send("Invoice PDF generation failed");
    }
});

// Generate PDF Job Sheet
app.get('/generate_job_sheet/:service_id', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    const { service_id } = req.params;
    
    try {
        const serviceRes = await pool.query(`
            SELECT s.*, v.reg_no, v.brand, v.model, v.year, v.engine_no, v.chassis_no,
                   u.name as owner_name, u.phone, u.email,
                   tech.name as tech_name
            FROM services s
            JOIN vehicles v ON s.vehicle_id = v.id
            JOIN users u ON v.owner_id = u.id
            LEFT JOIN users as tech ON s.technician_id = tech.id
            WHERE s.id = $1
        `, [service_id]);
        const service = serviceRes.rows[0];
        
        if (!service) return res.status(404).send("Service record not found");
        
        // Generate PDF
        const doc = new PDFDocument({ size: 'A4', margin: 20 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=JobSheet_${service.reg_no}.pdf`);
        doc.pipe(res);
        
        // Title
        doc.fillColor('#1e293b').fontSize(24).font('Helvetica-Bold').text('SERVICE JOB SHEET', 20, 20);
        const jobId = `JOB-${String(service.id).padStart(5, '0')}`;
        doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`JOB ID: #${jobId} | DATE: ${service.date}`, 20, 48);
        
        doc.moveTo(20, 70).lineTo(575, 70).strokeColor('#e2e8f0').lineWidth(1).stroke();
        
        // Info box
        doc.rect(20, 80, 555, 55).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text('CUSTOMER', 25, 90);
        doc.fontSize(10).fillColor('#000000').font('Helvetica-Bold').text(service.owner_name, 25, 105);
        doc.fontSize(10).font('Helvetica').text(service.phone, 25, 120);
        
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text('VEHICLE', 300, 90);
        doc.fontSize(10).fillColor('#000000').font('Helvetica-Bold').text(`${service.brand} ${service.model}`, 300, 105);
        doc.fontSize(10).font('Helvetica').text(service.reg_no, 300, 120);
        
        // Complaints
        doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text('REPORTED PROBLEMS / COMPLAINTS', 20, 160);
        doc.rect(20, 175, 555, 80).fill('#f8fafc');
        doc.fillColor('#000000').fontSize(11).font('Helvetica').text(service.problem || 'No description provided.', 30, 185, { width: 535 });
        
        let currentY = 275;
        if (service.request) {
            doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text('SPECIAL REQUESTS', 20, currentY);
            doc.rect(20, currentY + 15, 555, 60).fill('#f8fafc');
            doc.fillColor('#000000').fontSize(11).font('Helvetica').text(service.request, 30, currentY + 25, { width: 535 });
            currentY += 95;
        }
        
        // Tech Assignment
        doc.fontSize(11).fillColor('#000000').font('Helvetica').text(`ASSIGNED TECHNICIAN: ${service.tech_name || 'PENDING'}`, 20, currentY);
        
        // Signatures
        const sigY = 650;
        doc.fontSize(10).font('Helvetica').text('_______________________', 40, sigY);
        doc.text('Technician Signature', 40, sigY + 15);
        
        doc.text('_______________________', 380, sigY);
        doc.text('Customer Signature', 380, sigY + 15);
        
        doc.end();
    } catch (e) {
        console.error(e);
        res.status(500).send("Job Sheet PDF generation failed");
    }
});

// Update Order Status
app.post('/update_order_status', async (req, res) => {
    if (!req.session.user_id || req.session.role !== 'admin') return res.redirect('/login');
    const { order_id, status } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const orderRes = await client.query("SELECT status, part_id, quantity FROM orders WHERE id = $1", [order_id]);
        const order = orderRes.rows[0];
        
        if (order && order.status !== 'Cancelled' && status === 'Cancelled') {
            await client.query("UPDATE inventory SET stock = stock + $1 WHERE id = $2", [order.quantity, order.part_id]);
        }
        
        await client.query("UPDATE orders SET status = $1 WHERE id = $2", [status, order_id]);
        
        await client.query('COMMIT');
        res.redirect('/admin_dashboard');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).send("Update order status failed");
    } finally {
        client.release();
    }
});

// Buy Part Checkout Page
app.get('/buy/:part_id', async (req, res) => {
    const { part_id } = req.params;
    try {
        const partRes = await pool.query("SELECT * FROM inventory WHERE id = $1", [part_id]);
        const part = partRes.rows[0];
        if (!part) return res.status(404).send("Part not found");
        res.render('checkout.html', { part: part });
    } catch (e) {
        console.error(e);
        res.status(500).send("Checkout page load failed");
    }
});

// Place Direct Order
app.post('/place_order', async (req, res) => {
    const { part_id, quantity: qtyRaw, name, phone, location, payment_method } = req.body;
    const quantity = parseInt(qtyRaw) || 1;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const partRes = await client.query("SELECT price, stock FROM inventory WHERE id = $1", [part_id]);
        const part = partRes.rows[0];
        
        if (!part || part.stock < quantity) {
            await client.query('ROLLBACK');
            return res.status(400).send("Error: Item out of stock or unavailable.");
        }
        
        const totalAmount = part.price * quantity;
        
        const orderInsert = await client.query(`
            INSERT INTO orders (customer_name, phone, location, part_id, quantity, total_amount, payment_method)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [name, phone, location, part_id, quantity, totalAmount, payment_method]);
        const orderId = orderInsert.rows[0].id;
        
        await client.query("UPDATE inventory SET stock = stock - $1 WHERE id = $2", [quantity, part_id]);
        
        await client.query('COMMIT');
        res.render('order_success.html', { order_id: orderId, total: totalAmount });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).send("Order placement failed");
    } finally {
        client.release();
    }
});

// Detailed Vehicle Health Analytics page
app.get('/vehicle_health/:vehicle_id', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    const { vehicle_id } = req.params;
    
    try {
        let vehicleRes;
        if (req.session.role === 'customer') {
            vehicleRes = await pool.query("SELECT * FROM vehicles WHERE id = $1 AND owner_id = $2", [vehicle_id, req.session.user_id]);
        } else {
            vehicleRes = await pool.query("SELECT * FROM vehicles WHERE id = $1", [vehicle_id]);
        }
        const vehicle = vehicleRes.rows[0];
        
        if (!vehicle) return res.status(404).send("Vehicle not found or access denied");
        
        const healthData = await calculateVehicleHealthScore(vehicle_id);
        if (!healthData) return res.status(500).send("Unable to calculate health score");
        
        res.render('vehicle_health.html', {
            vehicle: vehicle,
            health: healthData
        });
    } catch (e) {
        console.error(e);
        res.status(500).send("Error fetching health analytics");
    }
});

// API endpoint for health analytics (JSON)
app.get('/api/vehicle_health/:vehicle_id', async (req, res) => {
    if (!req.session.user_id) return res.status(401).json({ error: 'Unauthorized' });
    const { vehicle_id } = req.params;
    
    try {
        const healthData = await calculateVehicleHealthScore(vehicle_id);
        if (!healthData) return res.status(404).json({ error: 'Vehicle not found' });
        res.json(healthData);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update Mileage
app.post('/update_mileage', async (req, res) => {
    if (!req.session.user_id) return res.redirect('/login');
    const { vehicle_id, mileage } = req.body;
    
    try {
        let vehicleRes;
        if (req.session.role === 'customer') {
            vehicleRes = await pool.query("SELECT * FROM vehicles WHERE id = $1 AND owner_id = $2", [vehicle_id, req.session.user_id]);
        } else {
            vehicleRes = await pool.query("SELECT * FROM vehicles WHERE id = $1", [vehicle_id]);
        }
        const vehicle = vehicleRes.rows[0];
        if (!vehicle) return res.status(404).send("Vehicle not found or access denied");
        
        const updateDate = new Date().toISOString().split('T')[0];
        await pool.query(`
            UPDATE vehicles 
            SET current_mileage = $1, last_mileage_update = $2 
            WHERE id = $3
        `, [parseInt(mileage) || 0, updateDate, vehicle_id]);
        
        const referrer = req.get('Referrer');
        if (referrer && referrer.includes('vehicle_health')) {
            return res.redirect(referrer);
        }
        
        if (req.session.role === 'customer') {
            res.redirect('/customer_dashboard');
        } else {
            res.redirect('/admin_dashboard');
        }
    } catch (e) {
        console.error(e);
        res.status(500).send("Mileage update failed");
    }
});

// Run server
if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
}

module.exports = app;
