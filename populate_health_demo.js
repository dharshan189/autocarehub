const { Pool } = require('pg');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASS || 'password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'vehicle_service'}`,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function populateMileageData() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const vehiclesRes = await client.query("SELECT id, year FROM vehicles");
        const vehicles = vehiclesRes.rows;
        
        console.log(`Found ${vehicles.length} vehicles`);
        
        const usageFactors = [0.8, 1.0, 1.2, 1.5, 1.8];
        const currentYear = new Date().getFullYear();
        
        for (let vehicle of vehicles) {
            const vehicleId = vehicle.id;
            const vehicleYear = vehicle.year || 2020;
            const vehicleAge = currentYear - vehicleYear;
            
            const usageFactor = usageFactors[Math.floor(Math.random() * usageFactors.length)];
            const avgYearlyKm = 13000 * usageFactor;
            
            let currentMileage = Math.floor(vehicleAge * avgYearlyKm);
            currentMileage += Math.floor(Math.random() * 7000) - 2000;
            currentMileage = Math.max(0, currentMileage);
            
            const nowStr = new Date().toISOString().split('T')[0];
            
            await client.query(`
                UPDATE vehicles 
                SET current_mileage = $1, 
                    last_mileage_update = $2 
                WHERE id = $3
            `, [currentMileage, nowStr, vehicleId]);
            
            console.log(`  Vehicle ID ${vehicleId}: ${currentMileage.toLocaleString()} km (Age: ${vehicleAge} years, Factor: ${usageFactor.toFixed(1)}x)`);
        }
        
        await client.query('COMMIT');
        console.log("\n✅ Mileage data populated successfully!");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error populating mileage:", e);
    } finally {
        client.release();
    }
}

async function addSampleServiceHistory() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const vehiclesRes = await client.query(`
            SELECT v.id, v.owner_id, COUNT(s.id) as service_count
            FROM vehicles v
            LEFT JOIN services s ON v.id = s.vehicle_id
            GROUP BY v.id, v.owner_id
            HAVING COUNT(s.id) < 3
            LIMIT 5
        `);
        const vehicles = vehiclesRes.rows;
        
        if (vehicles.length === 0) {
            console.log("All vehicles have sufficient service history");
            await client.query('COMMIT');
            return;
        }
        
        console.log(`\nAdding sample services to ${vehicles.length} vehicles...`);
        
        const serviceTypes = ['General', 'Engine', 'Electrical', 'Brakes', 'AC/Cooling'];
        const problems = [
            'Regular maintenance and oil change',
            'Brake pad replacement',
            'Engine oil and filter change',
            'AC gas refill and service',
            'Battery replacement',
            'Tire rotation and alignment',
            'Spark plug replacement',
            'Coolant flush and refill'
        ];
        
        for (let vehicle of vehicles) {
            const vehicleId = vehicle.id;
            const numServices = Math.floor(Math.random() * 2) + 2; // 2-3 services
            
            for (let i = 0; i < numServices; i++) {
                const daysAgo = Math.floor(Math.random() * 150) + 30 + (i * 60);
                const dateObj = new Date();
                dateObj.setDate(dateObj.getDate() - daysAgo);
                const dateStr = dateObj.toISOString().split('T')[0];
                
                const serviceType = serviceTypes[Math.floor(Math.random() * serviceTypes.length)];
                const problem = problems[Math.floor(Math.random() * problems.length)];
                
                const partsCost = Math.floor(Math.random() * 2500) + 500;
                const laborCost = Math.floor(Math.random() * 1200) + 300;
                
                await client.query(`
                    INSERT INTO services 
                    (vehicle_id, date, problem, service_type, status, parts_cost, labor_cost, payment_status)
                    VALUES ($1, $2, $3, $4, 'Completed', $5, $6, 'Paid')
                `, [vehicleId, dateStr, problem, serviceType, partsCost, laborCost]);
                
                console.log(`  Added service for Vehicle ${vehicleId}: ${problem} (${dateStr})`);
            }
        }
        
        await client.query('COMMIT');
        console.log("\n✅ Sample service history added!");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error adding sample services:", e);
    } finally {
        client.release();
    }
}

async function run() {
    console.log("============================================================");
    console.log("Vehicle Health Analytics - Demo Data Population");
    console.log("============================================================");
    console.log();
    
    try {
        await populateMileageData();
        await addSampleServiceHistory();
        console.log("\n============================================================");
        console.log("✨ Demo data setup complete!");
        console.log("============================================================");
    } catch (e) {
        console.error("Failed to populate:", e);
    } finally {
        await pool.end();
    }
}

run();
