/* =====================================================
   NEXTGEN AUTOCARE — LOCALSTORAGE DATABASE ENGINE (db.js)
   Simulates all Postgres database tables and actions client-side.
   ===================================================== */

const db = {
    // --- Data Getters & Setters ---
    getUsers() {
        return JSON.parse(localStorage.getItem('ng_users')) || [];
    },
    saveUsers(users) {
        localStorage.setItem('ng_users', JSON.stringify(users));
    },

    getVehicles() {
        return JSON.parse(localStorage.getItem('ng_vehicles')) || [];
    },
    saveVehicles(vehicles) {
        localStorage.setItem('ng_vehicles', JSON.stringify(vehicles));
    },

    getServices() {
        return JSON.parse(localStorage.getItem('ng_services')) || [];
    },
    saveServices(services) {
        localStorage.setItem('ng_services', JSON.stringify(services));
    },

    getInventory() {
        return JSON.parse(localStorage.getItem('ng_inventory')) || [];
    },
    saveInventory(inventory) {
        localStorage.setItem('ng_inventory', JSON.stringify(inventory));
    },

    getOrders() {
        return JSON.parse(localStorage.getItem('ng_orders')) || [];
    },
    saveOrders(orders) {
        localStorage.setItem('ng_orders', JSON.stringify(orders));
    },

    getEmergencyRequests() {
        return JSON.parse(localStorage.getItem('ng_emergency_requests')) || [];
    },
    saveEmergencyRequests(requests) {
        localStorage.setItem('ng_emergency_requests', JSON.stringify(requests));
    },

    getSettings() {
        const defaultSettings = {
            daily_capacity: "5",
            tech_commission_rate: "20",
            washing_capacity: "3"
        };
        return JSON.parse(localStorage.getItem('ng_settings')) || defaultSettings;
    },
    saveSettings(settings) {
        localStorage.setItem('ng_settings', JSON.stringify(settings));
    },

    getCurrentUser() {
        return JSON.parse(sessionStorage.getItem('ng_current_user')) || JSON.parse(localStorage.getItem('ng_current_user')) || null;
    },
    setCurrentUser(user, remember = false) {
        const userStr = JSON.stringify(user);
        if (remember) {
            localStorage.setItem('ng_current_user', userStr);
        } else {
            sessionStorage.setItem('ng_current_user', userStr);
        }
    },
    logout() {
        sessionStorage.removeItem('ng_current_user');
        localStorage.removeItem('ng_current_user');
        window.location.href = 'login.html';
    },

    // --- Database Initialization & Seeding ---
    init() {
        console.log("Initializing NextGen AutoCare database...");
        
        // Seed Settings if not exists
        if (!localStorage.getItem('ng_settings')) {
            this.saveSettings({
                daily_capacity: "5",
                tech_commission_rate: "20",
                washing_capacity: "3"
            });
        }

        // Seed Users if not exists
        let users = this.getUsers();
        if (users.length === 0) {
            users = [
                {
                    id: 1,
                    role: 'admin',
                    name: 'System Admin',
                    email: 'admin@service.com',
                    phone: '0000000000',
                    password: 'adminpassword', // plain-text or simulation simple matching
                    identifier: 'ADMIN-1001'
                },
                {
                    id: 2,
                    role: 'technician',
                    name: 'John Doe',
                    email: 'john@service.com',
                    phone: '9876543211',
                    password: 'techpassword',
                    identifier: 'TECH-1001',
                    specialization: 'Engine'
                },
                {
                    id: 3,
                    role: 'technician',
                    name: 'Sam Smith',
                    email: 'sam@service.com',
                    phone: '9876543212',
                    password: 'techpassword',
                    identifier: 'TECH-1002',
                    specialization: 'Braking'
                },
                {
                    id: 4,
                    role: 'technician',
                    name: 'Robert Stark',
                    email: 'robert@service.com',
                    phone: '9876543213',
                    password: 'techpassword',
                    identifier: 'TECH-1003',
                    specialization: 'Electrical'
                },
                {
                    id: 5,
                    role: 'customer',
                    name: 'Alex Johnson',
                    email: 'client@gmail.com',
                    phone: '9876543210',
                    password: 'customerpassword'
                }
            ];
            this.saveUsers(users);
        }

        // Seed Vehicles if not exists
        let vehicles = this.getVehicles();
        if (vehicles.length === 0) {
            vehicles = [
                {
                    id: 1,
                    owner_id: 5,
                    reg_no: 'KA01ME1234',
                    brand: 'Tesla',
                    model: 'Model 3',
                    year: 2022,
                    engine_no: 'ENG-TESLA-9923',
                    chassis_no: 'CHA-TESLA-88231',
                    insurance_company: 'Star Health Insurance',
                    policy_no: 'POL-992348',
                    policy_expiry: '2027-12-31',
                    image_url: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?q=80&w=1200',
                    current_mileage: 12000,
                    last_mileage_update: '2026-08-01'
                }
            ];
            this.saveVehicles(vehicles);
        }

        // Seed Inventory if not exists
        let inventory = this.getInventory();
        if (inventory.length === 0) {
            inventory = [
                { id: 1, name: 'Engine Oil', category: 'Engine', brand: 'Mobil 1', compatible_model: 'Universal', description: 'Premium synthetic engine oil 5W-40', price: 1200.0, purchase_price: 800.0, stock: 50, image_url: 'https://images.unsplash.com/photo-1635816823861-512803bba221?q=80&w=800', is_for_sale: true },
                { id: 2, name: 'Brake Pads', category: 'Braking', brand: 'Brembo', compatible_model: 'Universal', description: 'Semi-metallic front brake pads', price: 850.0, purchase_price: 500.0, stock: 30, image_url: 'https://images.unsplash.com/photo-1486006396193-471e6158ecfb?q=80&w=800', is_for_sale: true },
                { id: 3, name: 'Air Filter', category: 'Filters', brand: 'K&N', compatible_model: 'Universal', description: 'High-flow air filter', price: 450.0, purchase_price: 300.0, stock: 40, image_url: 'https://images.unsplash.com/photo-1621259182978-fbf93132d53d?q=80&w=800', is_for_sale: true },
                { id: 4, name: 'Oil Filter', category: 'Filters', brand: 'Bosch', compatible_model: 'Universal', description: 'Spin-on oil filter', price: 300.0, purchase_price: 150.0, stock: 100, image_url: 'https://images.unsplash.com/photo-1598460671400-9883584852c0?q=80&w=800', is_for_sale: true },
                { id: 5, name: 'Spark Plug', category: 'Engine', brand: 'NGK', compatible_model: 'Universal', description: 'Iridium spark plug', price: 350.0, purchase_price: 200.0, stock: 60, image_url: 'https://images.unsplash.com/photo-1632733711679-52923aa9e170?q=80&w=800', is_for_sale: true },
                { id: 6, name: 'Battery', category: 'Electrical', brand: 'Amaron', compatible_model: 'Universal', description: '12V 35Ah Lead Acid Battery', price: 3500.0, purchase_price: 2500.0, stock: 10, image_url: 'https://images.unsplash.com/photo-1620939511593-29937fd09903?q=80&w=800', is_for_sale: true },
                { id: 7, name: 'Coolant', category: 'Fluids', brand: 'Castrol', compatible_model: 'Universal', description: 'Engine coolant 1L', price: 250.0, purchase_price: 150.0, stock: 25, image_url: 'https://images.unsplash.com/photo-1621259182046-2b4751421711?q=80&w=800', is_for_sale: true },
                { id: 8, name: 'Wiper Blade', category: 'Accessories', brand: 'Bosch', compatible_model: 'Universal', description: '20-inch wiper blade', price: 200.0, purchase_price: 100.0, stock: 40, image_url: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?q=80&w=800', is_for_sale: true }
            ];
            this.saveInventory(inventory);
        }

        // Seed Services if not exists
        let services = this.getServices();
        if (services.length === 0) {
            services = [
                {
                    id: 1,
                    vehicle_id: 1,
                    technician_id: 2,
                    date: '2026-08-01',
                    problem: 'Periodic service check. Brake making some squeaking noise.',
                    request: 'Change oil and inspect brakes.',
                    status: 'Completed',
                    service_type: 'General',
                    parts_details: 'Engine Oil x1, Oil Filter x1',
                    parts_cost: 1500.0,
                    labor_cost: 600.0,
                    wash_cost: 150.0,
                    tech_commission: 120.0, // 20% of labor
                    center_share: 2130.0, // labor - commission + parts + wash
                    payment_status: 'Paid',
                    payment_method: 'Card',
                    rating: 5,
                    feedback: 'Excellent service! Quick and professional.',
                    is_insurance_claim: false,
                    claim_status: null
                },
                {
                    id: 2,
                    vehicle_id: 1,
                    technician_id: 3,
                    date: '2026-08-06',
                    problem: 'Air filter replacement & coolant top-up.',
                    request: 'Engine tune up.',
                    status: 'Under Repair',
                    service_type: 'Engine',
                    parts_details: 'Air Filter x1, Coolant x1',
                    parts_cost: 700.0,
                    labor_cost: 400.0,
                    wash_cost: 0.0,
                    tech_commission: 80.0,
                    center_share: 1020.0,
                    payment_status: 'Unpaid',
                    payment_method: null,
                    rating: null,
                    feedback: null,
                    is_insurance_claim: false,
                    claim_status: null
                }
            ];
            this.saveServices(services);
        }

        // Seed Emergency Requests if empty
        let emergencyRequests = this.getEmergencyRequests();
        if (emergencyRequests.length === 0) {
            emergencyRequests = [
                {
                    id: 1,
                    user_id: 5,
                    location: 'High Street Road, near Metro station',
                    problem: 'Flat tire and no spare kit.',
                    status: 'Resolved',
                    timestamp: new Date(Date.now() - 3600000 * 24).toISOString() // 1 day ago
                },
                {
                    id: 2,
                    user_id: 5,
                    location: 'Expressway Highway, KM 45',
                    problem: 'Engine overheating, white smoke from hood.',
                    status: 'Pending',
                    timestamp: new Date().toISOString()
                }
            ];
            this.saveEmergencyRequests(emergencyRequests);
        }

        // Seed Orders if empty
        let orders = this.getOrders();
        if (orders.length === 0) {
            orders = [
                {
                    id: 1,
                    customer_name: 'Alex Johnson',
                    phone: '9876543210',
                    location: '123 Luxury Avenue, Bangalore',
                    part_id: 1, // Engine Oil
                    quantity: 2,
                    total_amount: 2400.0,
                    payment_method: 'Card',
                    date: new Date(Date.now() - 3600000 * 5).toISOString(),
                    status: 'Delivered'
                }
            ];
            this.saveOrders(orders);
        }
    },

    // --- Authentication Actions ---
    login(role, identifier, password) {
        const users = this.getUsers();
        let matchedUser = null;

        if (role === 'customer') {
            matchedUser = users.find(u => u.role === 'customer' && (u.email === identifier || u.phone === identifier) && u.password === password);
        } else if (role === 'technician') {
            matchedUser = users.find(u => u.role === 'technician' && u.identifier === identifier && u.password === password);
        } else if (role === 'admin') {
            matchedUser = users.find(u => u.role === 'admin' && u.identifier === identifier && u.password === password);
        }

        if (matchedUser) {
            return { success: true, user: matchedUser };
        }
        return { success: false, message: 'Invalid credentials. Please try again.' };
    },

    register(name, email, phone, password, regNo, brand, model, year) {
        const users = this.getUsers();
        
        // Validation: Unique email/phone
        if (users.some(u => u.email === email)) {
            return { success: false, message: 'Email address already registered!' };
        }
        if (users.some(u => u.phone === phone)) {
            return { success: false, message: 'Phone number already registered!' };
        }

        // Validate vehicle registration
        const vehicles = this.getVehicles();
        if (vehicles.some(v => v.reg_no === regNo)) {
            return { success: false, message: 'Vehicle registration number already registered!' };
        }

        // Create new user
        const newUserId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
        const newUser = {
            id: newUserId,
            role: 'customer',
            name: name,
            email: email,
            phone: phone,
            password: password
        };
        users.push(newUser);
        this.saveUsers(users);

        // Create vehicle
        const newVehicleId = vehicles.length > 0 ? Math.max(...vehicles.map(v => v.id)) + 1 : 1;
        const brandImages = {
            'Maruti Suzuki': 'https://images.unsplash.com/photo-1549490349-8643362247b5?q=80&w=1200',
            'Hyundai': 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?q=80&w=1200',
            'Tata Motors': 'https://images.unsplash.com/photo-1603386329225-868f9b1ee6c9?q=80&w=1200',
            'Mahindra': 'https://images.unsplash.com/photo-1620608146313-2df67cc85766?q=80&w=1200',
            'Toyota': 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?q=80&w=1200',
            'Honda': 'https://images.unsplash.com/photo-1616455572844-825649a67b47?q=80&w=1200',
            'BMW': 'https://images.unsplash.com/photo-1555215695-3004980ad54e?q=80&w=1200',
            'Skoda': 'https://images.unsplash.com/photo-1594541818129-417d4722a84a?q=80&w=1200',
            'Kia': 'https://images.unsplash.com/photo-1632243193044-8e979827d52b?q=80&w=1200',
            'Volkswagen': 'https://images.unsplash.com/photo-1617469767053-d3b508a0d182?q=80&w=1200',
            'Renault': 'https://images.unsplash.com/photo-1613134268686-235b2e5cc8f2?q=80&w=1200',
            'Audi': 'https://images.unsplash.com/photo-1606152421631-f22758296719?q=80&w=1200',
            'Mercedes-Benz': 'https://images.unsplash.com/photo-1618843479313-4b88afaa5e6c?q=80&w=1200',
            'Default': 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=1200'
        };
        const newVehicle = {
            id: newVehicleId,
            owner_id: newUserId,
            reg_no: regNo,
            brand: brand,
            model: model,
            year: parseInt(year),
            engine_no: 'ENG-' + brand.substring(0,3).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000),
            chassis_no: 'CHA-' + brand.substring(0,3).toUpperCase() + '-' + Math.floor(10000 + Math.random() * 90000),
            insurance_company: '',
            policy_no: '',
            policy_expiry: '',
            image_url: brandImages[brand] || brandImages['Default'],
            current_mileage: 0,
            last_mileage_update: new Date().toISOString().split('T')[0]
        };
        vehicles.push(newVehicle);
        this.saveVehicles(vehicles);

        return { success: true, user: newUser };
    },

    // --- Helper to assign best technician ---
    autoAssignTechnician(serviceType) {
        const users = this.getUsers().filter(u => u.role === 'technician');
        const services = this.getServices().filter(s => !['Completed', 'Ready for Wash', 'Washing'].includes(s.status));

        // Filter tech by specialization matching serviceType
        let matchingTechs = users;
        if (serviceType) {
            matchingTechs = users.filter(u => u.specialization === serviceType || !u.specialization || u.specialization === 'General');
        }
        if (matchingTechs.length === 0) {
            matchingTechs = users; // Fallback to all techs
        }

        // Map techs to active load
        const techLoads = matchingTechs.map(t => {
            const load = services.filter(s => s.technician_id === t.id).length;
            return { techId: t.id, load: load };
        });

        // Sort by load ascending
        techLoads.sort((a, b) => a.load - b.load);
        return techLoads.length > 0 ? techLoads[0].techId : null;
    },

    // --- AI Vehicle Health Calculator ---
    calculateVehicleHealthScore(vehicleId) {
        const vehicle = this.getVehicles().find(v => v.id === parseInt(vehicleId));
        if (!vehicle) return { score: 100, status: 'Unknown', insights: [] };

        const services = this.getServices().filter(s => s.vehicle_id === parseInt(vehicleId));
        const completedServices = services.filter(s => s.status === 'Completed');
        
        let score = 95; // base score
        let insightsList = [];

        // 1. Mileage check
        const mileage = vehicle.current_mileage || 0;
        if (mileage > 100000) {
            score -= 15;
            insightsList.push('High vehicle mileage (>100k km) raises wear probability.');
        } else if (mileage > 50000) {
            score -= 8;
            insightsList.push('Moderate mileage (50k - 100k km). Standard wearable components should be inspected.');
        } else {
            insightsList.push('Low vehicle mileage. Main structural components are in excellent condition.');
        }

        // 2. Service frequency & time since last service
        if (services.length === 0) {
            score -= 20;
            insightsList.push('No service history found. Complete general diagnostic recommended.');
        } else {
            if (completedServices.length > 0) {
                // Find most recent completed service
                const dates = completedServices.map(s => new Date(s.date).getTime());
                const lastServiceTime = Math.max(...dates);
                const diffMonths = (Date.now() - lastServiceTime) / (1000 * 60 * 60 * 24 * 30);

                if (diffMonths > 12) {
                    score -= 15;
                    insightsList.push(`Last service was ${Math.round(diffMonths)} months ago. Overdue for annual inspection.`);
                } else if (diffMonths > 6) {
                    score -= 5;
                    insightsList.push(`Last service was ${Math.round(diffMonths)} months ago. Consider a health checkup soon.`);
                } else {
                    insightsList.push(`Excellent service frequency. Serviced recently (${Math.round(diffMonths)} months ago).`);
                }
            } else {
                score -= 10;
                insightsList.push('No completed services found on record. Pending repairs should be executed.');
            }
        }

        // 3. Problem severity checks
        const activeProblemsCount = services.filter(s => !['Completed', 'Cancelled'].includes(s.status)).length;
        if (activeProblemsCount > 0) {
            score -= (activeProblemsCount * 7);
            insightsList.push(`${activeProblemsCount} active diagnostic/repair jobs currently ongoing.`);
        }

        // Ensure bounds
        score = Math.max(10, Math.min(100, score));

        let status = 'Excellent';
        let statusIcon = '✅';
        let statusColor = '#10b981'; // green
        if (score < 50) {
            status = 'Critical';
            statusIcon = '🚨';
            statusColor = '#ef4444'; // red
        } else if (score < 75) {
            status = 'Fair';
            statusIcon = '⚠️';
            statusColor = '#f59e0b'; // amber
        } else if (score < 90) {
            status = 'Good';
            statusIcon = 'ℹ️';
            statusColor = '#3b82f6'; // blue
        }

        // Recommendations based on score & mileage
        let recommendations = [];
        if (score < 75) {
            recommendations.push('Schedule an urgent full system scan to resolve outstanding codes.');
            recommendations.push('Inspect engine belts, spark plugs, and brake fluid health.');
        } else {
            recommendations.push('Maintain regular service cycles to retain high vehicle reliability.');
            recommendations.push('Keep tires rotated and check inflation pressure monthly.');
        }

        // Predictive Maintenance Suggestions
        let maintenanceSuggestions = [];
        if (mileage > 80000) {
            maintenanceSuggestions.push('Transmission fluid flush and filter replacement recommended within 5,000 km.');
            maintenanceSuggestions.push('Inspect timing belt and water pump for signs of stress or cracks.');
        } else if (mileage > 40000) {
            maintenanceSuggestions.push('Inspect front brake pads and rotors. Remaining life estimated at 35%.');
            maintenanceSuggestions.push('Cabin air filter and engine air filter replacement due next service.');
        } else {
            maintenanceSuggestions.push('Standard tire rotation and wheel alignment check recommended at next service.');
            maintenanceSuggestions.push('General multi-point inspection of battery charging performance.');
        }

        // Calculate vehicle age
        const currentYear = new Date().getFullYear();
        const vehicleAge = Math.max(1, currentYear - (vehicle.year || currentYear - 2));

        // Average service cost
        let totalCostSum = 0;
        completedServices.forEach(s => {
            totalCostSum += (s.parts_cost || 0) + (s.labor_cost || 0) + (s.wash_cost || 0);
        });
        const avgCost = completedServices.length > 0 ? (totalCostSum / completedServices.length) : 0;

        // Next recommended service date (6 months from last service or today + 3 months)
        let nextServiceDate = '3 Months From Now';
        if (completedServices.length > 0) {
            const dates = completedServices.map(s => new Date(s.date).getTime());
            const lastServiceDate = new Date(Math.max(...dates));
            lastServiceDate.setMonth(lastServiceDate.getMonth() + 6);
            nextServiceDate = lastServiceDate.toISOString().split('T')[0];
        } else {
            const nextDate = new Date();
            nextDate.setMonth(nextDate.getMonth() + 3);
            nextServiceDate = nextDate.toISOString().split('T')[0];
        }

        return {
            score: score,
            status: status,
            status_icon: statusIcon,
            status_color: statusColor,
            insights: insightsList,
            recommendations: recommendations,
            maintenance_suggestions: maintenanceSuggestions,
            total_services: services.length,
            repair_count: services.filter(s => s.service_type !== 'Washing' && s.status === 'Completed').length,
            current_mileage: mileage,
            vehicle_age: vehicleAge,
            avg_service_cost: avgCost || 2500, // default if no services yet
            next_service_date: nextServiceDate,
            brand: vehicle.brand,
            model: vehicle.model,
            reg_no: vehicle.reg_no,
            year: vehicle.year
        };
    }
};

// Auto-initialize when file is parsed
db.init();
window.db = db; // expose to window
