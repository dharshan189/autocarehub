const { Pool } = require('pg');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASS || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'vehicle_service'}`,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function seed() {
    console.log("Connecting to database for seeding...");
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log("Seeding Technicians with Specializations...");
        const technicians = [
            ['Mike Ross', 'mike@tech.com', '9000000001', 'mike123', 'Engine'],
            ['Sarah Jenkins', 'sarah@tech.com', '9000000002', 'sarah123', 'Electrical'],
            ['Tom Hardy', 'tom@tech.com', '9000000003', 'tom123', 'Brakes'],
            ['John Smith', 'john@tech.com', '9000000004', 'john123', 'General'],
            ['Emma Wilson', 'emma@tech.com', '9000000005', 'emma123', 'Transmission']
        ];
        
        const techIds = [];
        for (let [name, email, phone, password, specialization] of technicians) {
            const check = await client.query("SELECT id FROM users WHERE email = $1", [email]);
            if (check.rows.length > 0) {
                techIds.push(check.rows[0].id);
            } else {
                const res = await client.query(
                    "INSERT INTO users (role, name, email, phone, password, specialization) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                    ['technician', name, email, phone, password, specialization]
                );
                techIds.push(res.rows[0].id);
            }
        }
        
        console.log("Seeding Customers and Vehicles...");
        const customers = [
            ['Alice Johnson', 'alice@example.com', '8000000001', 'alice123', [
                ['KA05MT1234', 'Toyota', 'Camry', 2021, 'ENG998877', 'CHS1122334455'],
                ['KA05MT5678', 'Honda', 'Civic', 2018, 'ENG554433', 'CHS5566778899']
            ]],
            ['Bob Wilson', 'bob@example.com', '8000000002', 'bob123', [
                ['KA01PK9999', 'Tesla', 'Model 3', 2023, 'ENG000001', 'CHS9988776655']
            ]],
            ['Carol White', 'carol@example.com', '8000000003', 'car123', [
                ['KA03XY4545', 'Ford', 'Mustang', 2015, 'ENG776655', 'CHS3344556677']
            ]]
        ];
        
        const vehicleIds = [];
        for (let [name, email, phone, password, vehicles] of customers) {
            let userId;
            const checkUser = await client.query("SELECT id FROM users WHERE email = $1", [email]);
            if (checkUser.rows.length > 0) {
                userId = checkUser.rows[0].id;
            } else {
                const userRes = await client.query(
                    "INSERT INTO users (role, name, email, phone, password) VALUES ($1, $2, $3, $4, $5) RETURNING id",
                    ['customer', name, email, phone, password]
                );
                userId = userRes.rows[0].id;
            }
            
            for (let [reg, brand, model, year, eng, chs] of vehicles) {
                const checkVehicle = await client.query("SELECT id FROM vehicles WHERE reg_no = $1", [reg]);
                if (checkVehicle.rows.length > 0) {
                    vehicleIds.push(checkVehicle.rows[0].id);
                } else {
                    const vehicleRes = await client.query(
                        "INSERT INTO vehicles (owner_id, reg_no, brand, model, year, engine_no, chassis_no) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
                        [userId, reg, brand, model, year, eng, chs]
                    );
                    vehicleIds.push(vehicleRes.rows[0].id);
                }
            }
        }
        
        console.log("Seeding Services...");
        const problems = [
            "Oil change and general inspection",
            "Brake noise and shaky steering",
            "Engine overheating",
            "Battery replacement",
            "AC not cooling",
            "Tire rotation and alignment"
        ];
        
        const TECH_COMMISSION_RATE = 0.20;
        
        // Past Services (Completed)
        for (let i = 0; i < 5; i++) {
            const vid = vehicleIds[Math.floor(Math.random() * vehicleIds.length)];
            const tid = techIds[Math.floor(Math.random() * techIds.length)];
            
            const daysAgo = Math.floor(Math.random() * 25) + 5;
            const dateObj = new Date();
            dateObj.setDate(dateObj.getDate() - daysAgo);
            const dateStr = dateObj.toISOString().split('T')[0];
            
            const prob = problems[Math.floor(Math.random() * problems.length)];
            const partsCost = Math.floor(Math.random() * 4500) + 500;
            const laborCost = Math.floor(Math.random() * 2000) + 1000;
            const washCost = [0, 100, 150, 200][Math.floor(Math.random() * 4)];
            
            const techCommission = Math.round((laborCost * TECH_COMMISSION_RATE) * 100) / 100;
            const centerShare = Math.round(((laborCost - techCommission) + partsCost + washCost) * 100) / 100;
            
            const payMethod = Math.random() > 0.5 ? 'online' : 'offline';
            
            await client.query(`
                INSERT INTO services (vehicle_id, technician_id, date, problem, status, parts_details, parts_cost, labor_cost, wash_cost, tech_commission, center_share, payment_status, payment_method)
                VALUES ($1, $2, $3, $4, 'Completed', 'Standard parts used', $5, $6, $7, $8, $9, 'Paid', $10)
            `, [vid, tid, dateStr, prob, partsCost, laborCost, washCost, techCommission, centerShare, payMethod]);
        }
        
        // Active Services (Pending)
        for (let i = 0; i < 3; i++) {
            const vid = vehicleIds[Math.floor(Math.random() * vehicleIds.length)];
            const dateStr = new Date().toISOString().split('T')[0];
            const prob = problems[Math.floor(Math.random() * problems.length)];
            
            await client.query(`
                INSERT INTO services (vehicle_id, date, problem, status)
                VALUES ($1, $2, $3, 'Pending')
            `, [vid, dateStr, prob]);
        }
        
        console.log("Seeding Emergency Requests...");
        const locations = ["Main Street, Downtown", "North Highway Exit 12", "South Mall Parking", "Airport Road"];
        const emergencyProbs = ["Flat tire", "Engine stall", "Locked out of car", "Smoke from hood"];
        
        const custRes = await client.query("SELECT id FROM users WHERE role = 'customer'");
        const custIds = custRes.rows.map(r => r.id);
        
        if (custIds.length > 0) {
            for (let i = 0; i < 3; i++) {
                const uid = custIds[Math.floor(Math.random() * custIds.length)];
                const loc = locations[Math.floor(Math.random() * locations.length)];
                const prob = emergencyProbs[Math.floor(Math.random() * emergencyProbs.length)];
                await client.query("INSERT INTO emergency_requests (user_id, location, problem, status) VALUES ($1, $2, $3, 'Pending')", [uid, loc, prob]);
            }
        }
        
        await client.query('COMMIT');
        console.log("✅ Database seeding completed successfully!");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Seeding error:", e);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
