import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import {
            getAuth,
            signInWithPopup,
            GoogleAuthProvider,
            signOut,
            onAuthStateChanged
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import {
            getFirestore,
            doc,
            setDoc,
            addDoc,
            updateDoc,
            deleteDoc,
            onSnapshot,
            collection,
            query,
            where,
            getDocs
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- GLOBAL VARIABLES ---
        let db, auth;
        let userId;
        let inventoryCollectionRef, salesCollectionRef, expensesCollectionRef;
        let currentUser = null;

        // IMPORTANT: Replace these with your authorized Google emails
        const authorizedEmails = [
            'mominrhaman007@gmail.com',
            'mominbackstory@gmail.com'
        ];

        const emailRoles = {
            'mominrhaman007@gmail.com': 'master',
            'mominbackstory@gmail.com': 'employee'
        };

        // Traditional login credentials (fallback)
        const traditionalCredentials = {
            'bentree': { pass: 'bentree12321', role: 'master', name: 'Bentree Master', userId: 'shared_bentree_inventory' },
            'team1': { pass: 'bentre12345', role: 'employee', name: 'Team Member', userId: 'shared_bentree_inventory' }
        };

        let localInventory = {};
        let localSales = [];
        let localExpenses = {};

        const productCategories = [
            'Formal Shirt', 'Casual Shirt', 'Panjabi', 'Tie', 'Joggers',
            'Trousar', 'Payjama', 'T-shirt', 'Brooch Pin', 'Jeans',
            'Cuban Shirt', 'Half Sleeve Shirt', 'Thobe', 'Others'
        ];

        let inventoryCollectionPath = "";
        let salesCollectionPath = "";
        let expensesCollectionPath = "";

        let unsubscribeInventory = null;
        let unsubscribeSales = null;
        let unsubscribeExpenses = null;

        // --- CONFIG & INITIALIZATION ---
        const firebaseConfig = {
            apiKey: "AIzaSyDIZzacTHhMBpDDynw1p_q_3yi7sp3FknQ",
            authDomain: "bentree-inventory.firebaseapp.com",
            projectId: "bentree-inventory",
            storageBucket: "bentree-inventory.firebasestorage.app",
            messagingSenderId: "1068771462729",
            appId: "1:1068771462729:web:c8554bd93e7a5188833998",
        };
        const appId = "1:1068771462729:web:c8554bd93e7a5188833998";

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // --- AUTHENTICATION ---
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Check if user email is authorized
                if (!authorizedEmails.includes(user.email)) {
                    showToast("Unauthorized email. Access denied.", "error");
                    await signOut(auth);
                    showLoginView();
                    return;
                }

                currentUser = user;
                userId = user.uid;
                
                // Update UI with user info
                document.getElementById('userDisplayName').textContent = user.displayName || user.email;
                document.getElementById('userEmail').textContent = user.email;
                
                if (user.photoURL) {
                    const photoEl = document.getElementById('userPhoto');
                    photoEl.src = user.photoURL;
                    photoEl.classList.remove('hidden');
                }

                // Define user-specific collection paths
                inventoryCollectionPath = `/artifacts/${appId}/users/${userId}/inventory`;
                salesCollectionPath = `/artifacts/${appId}/users/${userId}/sales`;
                expensesCollectionPath = `/artifacts/${appId}/users/${userId}/expenses`;

                inventoryCollectionRef = collection(db, inventoryCollectionPath);
                salesCollectionRef = collection(db, salesCollectionPath);
                expensesCollectionRef = collection(db, expensesCollectionPath);

                // Determine user role
                const userRole = emailRoles[user.email] || 'employee';
                sessionStorage.setItem('userRole', userRole);

                // Show app view
                document.getElementById('login-view').classList.add('hidden');
                document.getElementById('app-view').classList.remove('hidden');
                applyRoleRestrictions(userRole);

                // Start data listeners
                attachFirestoreListeners();
            } else {
                console.log("User is not signed in.");
                currentUser = null;
                showLoginView();
            }
        });

        // Google Sign In
        async function signInWithGoogle() {
            const provider = new GoogleAuthProvider();
            try {
                const result = await signInWithPopup(auth, provider);
                console.log("Google Sign-In successful:", result.user.email);
                showToast(`Welcome ${result.user.displayName}!`, "success");
            } catch (error) {
                console.error("Google Sign-In Error:", error);
                if (error.code === 'auth/popup-closed-by-user') {
                    showToast("Sign-in popup was closed.", "error");
                } else if (error.code === 'auth/cancelled-popup-request') {
                    // Ignore
                } else {
                    showToast(`Sign-in failed: ${error.message}`, "error");
                }
            }
        }

        // Traditional Login
        async function signInTraditional(username, password) {
            const cred = traditionalCredentials[username];
            if (cred && cred.pass === password) {
                currentUser = {
                    uid: cred.userId,  // Use the shared userId
                    email: `${username}@local`,
                    displayName: cred.name
                };
                userId = currentUser.uid;

                document.getElementById('userDisplayName').textContent = currentUser.displayName;
                document.getElementById('userEmail').textContent = currentUser.email;
                document.getElementById('userPhoto').classList.add('hidden');

                inventoryCollectionPath = `/artifacts/${appId}/users/${userId}/inventory`;
                salesCollectionPath = `/artifacts/${appId}/users/${userId}/sales`;
                expensesCollectionPath = `/artifacts/${appId}/users/${userId}/expenses`;

                inventoryCollectionRef = collection(db, inventoryCollectionPath);
                salesCollectionRef = collection(db, salesCollectionPath);
                expensesCollectionRef = collection(db, expensesCollectionPath);

                sessionStorage.setItem('userRole', cred.role);
                sessionStorage.setItem('traditionalUser', JSON.stringify(currentUser));

                document.getElementById('login-view').classList.add('hidden');
                document.getElementById('app-view').classList.remove('hidden');
                applyRoleRestrictions(cred.role);

                attachFirestoreListeners();
                showToast(`Welcome ${cred.name}!`, "success");
                return true;
            }
            return false;
        }

        // --- ROLE & LOGIN MANAGEMENT ---
        async function handleLogin(e) {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');

            const success = await signInTraditional(username, password);
            if (!success) {
                errorEl.textContent = "Invalid username or password.";
                errorEl.classList.remove('hidden');
            } else {
                errorEl.classList.add('hidden');
            }
        }

        async function showLoginView() {
            if (unsubscribeInventory) unsubscribeInventory();
            if (unsubscribeSales) unsubscribeSales();
            if (unsubscribeExpenses) unsubscribeExpenses();
            
            localInventory = {};
            localSales = [];
            localExpenses = {};
            currentUser = null;
            userId = null;

            sessionStorage.clear();

            document.getElementById('app-view').classList.add('hidden');
            document.getElementById('login-view').classList.remove('hidden');

            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
            document.getElementById('login-error').classList.add('hidden');

            if (auth.currentUser) {
                await signOut(auth);
            }
        }

        function applyRoleRestrictions(role) {
            const expenseTab = document.getElementById('tab-expense');
            if (role === 'employee') {
                expenseTab.classList.add('hidden');
                if (!document.getElementById('view-expense').classList.contains('hidden')) {
                    setActiveTab(document.getElementById('tab-inventory'), document.getElementById('view-inventory'));
                }
            } else if (role === 'master') {
                expenseTab.classList.remove('hidden');
            }
        }

        // --- FIRESTORE LISTENERS ---
        function attachFirestoreListeners() {
            if (unsubscribeInventory) unsubscribeInventory();
            if (unsubscribeSales) unsubscribeSales();
            if (unsubscribeExpenses) unsubscribeExpenses();

            unsubscribeInventory = onSnapshot(inventoryCollectionRef, (snapshot) => {
                localInventory = {};
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    localInventory[data.code] = {
                        id: doc.id,
                        ...data,
                        currentUnit: data.unit,
                        totalValue: data.unit * data.cost,
                        unitSold: 0,
                        revenue: 0,
                        profitLoss: -(data.unit * data.cost)
                    };
                });
                updateProductDatalist();
                renderInventoryTable();
                if (localSales.length > 0) {
                    updateInventoryCalculations();
                }
                updateExpenseView();
            }, (error) => {
                console.error("Error listening to inventory:", error);
                showToast("Error fetching inventory.", "error");
            });

            unsubscribeSales = onSnapshot(salesCollectionRef, (snapshot) => {
                localSales = [];
                snapshot.forEach((doc) => {
                    localSales.push({ id: doc.id, ...doc.data() });
                });
                localSales.sort((a, b) => new Date(b.date) - new Date(a.date));
                updateInventoryCalculations();
                filterAndRenderSales();
                updateExpenseView();
            }, (error) => {
                console.error("Error listening to sales:", error);
                showToast("Error fetching sales.", "error");
            });

            unsubscribeExpenses = onSnapshot(expensesCollectionRef, (snapshot) => {
                localExpenses = {};
                snapshot.forEach((doc) => {
                    localExpenses[doc.id] = { id: doc.id, ...doc.data() };
                });
                updateExpenseView();
            }, (error) => {
                console.error("Error listening to expenses:", error);
                showToast("Error fetching expenses.", "error");
            });
        }

        // --- CORE LOGIC ---
        function updateInventoryCalculations() {
            if (Object.keys(localInventory).length === 0) return;

            const salesSummary = {};
            for (const code in localInventory) {
                salesSummary[code] = { totalUnits: 0, totalRevenue: 0 };
            }

            localSales.forEach(sale => {
                if (salesSummary[sale.code]) {
                    salesSummary[sale.code].totalUnits += Number(sale.unitsSold);
                    salesSummary[sale.code].totalRevenue += Number(sale.unitsSold) * Number(sale.salePrice);
                }
            });

            for (const code in localInventory) {
                const product = localInventory[code];
                const summary = salesSummary[code];

                product.unitSold = summary.totalUnits;
                product.revenue = summary.totalRevenue;
                product.currentUnit = product.unit - product.unitSold;
                product.totalValue = product.currentUnit * product.cost;

                const initialTotalCost = product.unit * product.cost;
                product.profitLoss = product.revenue - initialTotalCost;
            }

            renderInventoryTable();
        }

        function updateExpenseView() {
            const month = document.getElementById('expense-month-filter').value;
            if (!month) {
                clearExpenseForm();
                document.getElementById('expense-total-revenue').textContent = '0.00';
                document.getElementById('expense-total-cogs').textContent = '0.00';
                calculateAndDisplayActualProfit();
                return;
            }

            let monthRevenue = 0;
            let monthCOGS = 0;
            localSales.forEach(sale => {
                if (sale.date.startsWith(month)) {
                    monthRevenue += Number(sale.unitsSold) * Number(sale.salePrice);
                    const product = localInventory[sale.code];
                    const costPrice = product ? product.cost : 0;
                    monthCOGS += Number(sale.unitsSold) * costPrice;
                }
            });

            document.getElementById('expense-total-revenue').textContent = formatCurrency(monthRevenue);
            document.getElementById('expense-total-cogs').textContent = formatCurrency(monthCOGS);

            const savedExpenses = localExpenses[month];
            if (savedExpenses) {
                document.getElementById('expense-media').value = savedExpenses.media || '';
                document.getElementById('expense-salary').value = savedExpenses.salary || '';
                document.getElementById('expense-rent').value = savedExpenses.rent || '';
                document.getElementById('expense-utility').value = savedExpenses.utility || '';
                document.getElementById('expense-vat').value = savedExpenses.vat || '';
                document.getElementById('expense-return').value = savedExpenses.return || '';
                document.getElementById('expense-food').value = savedExpenses.food || '';
                document.getElementById('expense-transport').value = savedExpenses.transport || '';
                document.getElementById('expense-accessories').value = savedExpenses.accessories || '';
                document.getElementById('expense-others').value = savedExpenses.others || '';
            } else {
                clearExpenseForm();
            }

            calculateAndDisplayActualProfit();
        }

        function calculateAndDisplayActualProfit() {
            const revenue = Number(document.getElementById('expense-total-revenue').textContent);
            const cogs = Number(document.getElementById('expense-total-cogs').textContent);

            const expenseInputs = document.querySelectorAll('.expense-input');
            let totalExpenses = 0;
            expenseInputs.forEach(input => {
                totalExpenses += Number(input.value) || 0;
            });

            const actualProfit = revenue - cogs - totalExpenses;

            document.getElementById('expense-total-expense').textContent = formatCurrency(totalExpenses);

            const profitEl = document.getElementById('expense-actual-profit');
            profitEl.textContent = formatCurrency(actualProfit);
            profitEl.className = `text-2xl font-bold ${actualProfit >= 0 ? 'text-green-700' : 'text-red-700'}`;
        }

        function clearExpenseForm() {
            document.querySelectorAll('.expense-input').forEach(input => input.value = '');
        }

        // --- RENDERING FUNCTIONS ---
        function renderInventoryTable() {
            const tableBody = document.getElementById('inventory-table-body');
            const inventorySearch = document.getElementById('search-inventory').value.toLowerCase();
            tableBody.innerHTML = '';

            let totalStock = 0;
            let totalValue = 0;
            let totalSold = 0;
            let totalRevenue = 0;
            let totalPL = 0;

            const filteredInventory = Object.values(localInventory).filter(item =>
                item.code.toLowerCase().includes(inventorySearch)
            );

            if (filteredInventory.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-gray-500">No products found.</td></tr>`;
            }

            filteredInventory.forEach(item => {
                const plClass = item.profitLoss >= 0 ? 'text-green-600' : 'text-red-600';

                totalStock += item.currentUnit;
                totalValue += item.totalValue;
                totalSold += item.unitSold;
                totalRevenue += item.revenue;
                totalPL += item.profitLoss;

                const row = `
                    <tr class="hover:bg-gray-50">
                        <td class="p-3 font-medium text-gray-800">${item.code}</td>
                        <td class="p-3 text-gray-700">${item.category || 'N/A'}</td>
                        <td class="p-3 text-gray-700">${item.currentUnit}</td>
                        <td class="p-3 text-gray-700">${formatCurrency(item.cost)}</td>
                        <td class="p-3 text-gray-700">${formatCurrency(item.totalValue)}</td>
                        <td class="p-3 text-gray-700">${item.unitSold}</td>
                        <td class="p-3 text-gray-700">${formatCurrency(item.revenue)}</td>
                        <td class="p-3 font-semibold ${plClass}">${formatCurrency(item.profitLoss)}</td>
                        <td class="p-3">
                            <button class="btn-delete-product p-1 text-red-500 hover:text-red-700" data-id="${item.id}" data-code="${item.code}">
                                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        </td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', row);
            });

            document.getElementById('total-stock').textContent = totalStock;
            document.getElementById('total-inventory-value').textContent = formatCurrency(totalValue);
            document.getElementById('total-unit-sold').textContent = totalSold;
            document.getElementById('total-revenue').textContent = formatCurrency(totalRevenue);

            const totalPLClass = totalPL >= 0 ? 'text-green-600' : 'text-red-600';
            const totalPLElement = document.getElementById('total-profit-loss');
            totalPLElement.textContent = formatCurrency(totalPL);
            totalPLElement.className = `p-3 font-bold ${totalPLClass}`;

            document.querySelectorAll('.btn-delete-product').forEach(btn => {
                btn.addEventListener('click', handleDeleteProduct);
            });
        }

        function renderSalesTable(salesToRender = []) {
            const tableBody = document.getElementById('sales-table-body');
            tableBody.innerHTML = '';

            let filteredRevenue = 0;
            let filteredCOGS = 0;
            let filteredProfit = 0;

            if (salesToRender.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-gray-500">No sales found.</td></tr>`;
            }

            salesToRender.forEach(sale => {
                const product = localInventory[sale.code];
                const costPrice = product ? product.cost : 0;

                const totalRevenue = sale.salePrice * sale.unitsSold;
                const totalCOGS = costPrice * sale.unitsSold;
                const netProfit = totalRevenue - totalCOGS;

                filteredRevenue += totalRevenue;
                filteredCOGS += totalCOGS;
                filteredProfit += netProfit;

                const profitClass = netProfit >= 0 ? 'text-green-600' : 'text-red-600';

                const row = `
                    <tr class="hover:bg-gray-50">
                        <td class="p-3 text-gray-700">${sale.date}</td>
                        <td class="p-3 font-medium text-gray-800">${sale.code}</td>
                        <td class="p-3 text-gray-700">${sale.unitsSold}</td>
                        <td class="p-3 text-gray-700">${formatCurrency(sale.salePrice)}</td>
                        <td class="p-3 text-gray-700">${formatCurrency(costPrice)}</td>
                        <td class="p-3 text-gray-700">${formatCurrency(totalRevenue)}</td>
                        <td class="p-3 text-gray-700">${formatCurrency(totalCOGS)}</td>
                        <td class="p-3 font-semibold ${profitClass}">${formatCurrency(netProfit)}</td>
                        <td class="p-3 flex gap-2">
                            <button class="btn-edit-sale p-1 text-blue-500 hover:text-blue-700" data-id="${sale.id}">
                                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </button>
                            <button class="btn-delete-sale p-1 text-red-500 hover:text-red-700" data-id="${sale.id}">
                                <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        </td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', row);
            });

            document.getElementById('filtered-total-revenue').textContent = formatCurrency(filteredRevenue);
            document.getElementById('filtered-total-cogs').textContent = formatCurrency(filteredCOGS);

            const filteredProfitEl = document.getElementById('filtered-total-profit');
            filteredProfitEl.textContent = formatCurrency(filteredProfit);
            filteredProfitEl.className = `p-3 font-bold ${filteredProfit >= 0 ? 'text-green-600' : 'text-red-600'}`;

            document.querySelectorAll('.btn-edit-sale').forEach(btn => {
                btn.addEventListener('click', handleEditSale);
            });
            document.querySelectorAll('.btn-delete-sale').forEach(btn => {
                btn.addEventListener('click', handleDeleteSale);
            });
        }

        function updateProductDatalist() {
            const datalist = document.getElementById('product-codes-list');
            datalist.innerHTML = '';
            Object.keys(localInventory).forEach(code => {
                datalist.insertAdjacentHTML('beforeend', `<option value="${code}">`);
            });
        }

        // --- EVENT HANDLERS ---
        document.getElementById('form-add-product').addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = document.getElementById('product-code').value.trim();
            const category = document.getElementById('product-category').value;
            const unit = Number(document.getElementById('product-unit').value);
            const cost = Number(document.getElementById('product-cost').value);

            if (!code || !category || unit <= 0 || cost <= 0) {
                showToast("Please enter valid product details.", "error");
                return;
            }

            if (localInventory[code]) {
                showToast("Product code already exists.", "error");
                return;
            }

            try {
                await addDoc(inventoryCollectionRef, { code, category, unit, cost });
                showToast("Product added successfully!", "success");
                e.target.reset();
            } catch (error) {
                console.error("Error adding product:", error);
                showToast("Failed to add product.", "error");
            }
        });

        function handleDeleteProduct(e) {
            const docId = e.currentTarget.dataset.id;
            const productCode = e.currentTarget.dataset.code;

            showConfirm(
                "Delete Product?",
                `Delete '${productCode}' and ALL sales history?`,
                async () => {
                    try {
                        await deleteDoc(doc(db, inventoryCollectionPath, docId));

                        const q = query(salesCollectionRef, where("code", "==", productCode));
                        const querySnapshot = await getDocs(q);

                        const deletePromises = [];
                        querySnapshot.forEach((saleDoc) => {
                            deletePromises.push(deleteDoc(saleDoc.ref));
                        });

                        await Promise.all(deletePromises);
                        showToast(`Product '${productCode}' deleted.`, "success");
                    } catch (error) {
                        console.error("Error deleting product:", error);
                        showToast("Failed to delete product.", "error");
                    }
                }
            );
        }

        document.getElementById('form-add-sale').addEventListener('submit', async (e) => {
            e.preventDefault();
            const date = document.getElementById('sale-date').value;
            const code = document.getElementById('sale-product-code').value;
            const unitsSold = Number(document.getElementById('sale-units').value);
            const salePrice = Number(document.getElementById('sale-price').value);

            if (!date || !code || unitsSold <= 0 || salePrice <= 0) {
                showToast("Please enter valid sale details.", "error");
                return;
            }

            const product = localInventory[code];
            if (!product) {
                showToast("Product code not found.", "error");
                return;
            }

            if (unitsSold > product.currentUnit) {
                showToast(`Not enough stock. Only ${product.currentUnit} units available.`, "error");
                return;
            }

            try {
                await addDoc(salesCollectionRef, { date, code, unitsSold, salePrice });
                showToast("Sale added successfully!", "success");
                e.target.reset();
                document.getElementById('sale-date').value = new Date().toISOString().split('T')[0];
            } catch (error) {
                console.error("Error adding sale:", error);
                showToast("Failed to add sale.", "error");
            }
        });

        document.getElementById('form-expense').addEventListener('submit', async (e) => {
            e.preventDefault();
            const month = document.getElementById('expense-month-filter').value;
            if (!month) {
                showToast("Please select a month.", "error");
                return;
            }

            const expenseData = {
                month: month,
                media: Number(document.getElementById('expense-media').value) || 0,
                salary: Number(document.getElementById('expense-salary').value) || 0,
                rent: Number(document.getElementById('expense-rent').value) || 0,
                utility: Number(document.getElementById('expense-utility').value) || 0,
                vat: Number(document.getElementById('expense-vat').value) || 0,
                return: Number(document.getElementById('expense-return').value) || 0,
                food: Number(document.getElementById('expense-food').value) || 0,
                transport: Number(document.getElementById('expense-transport').value) || 0,
                accessories: Number(document.getElementById('expense-accessories').value) || 0,
                others: Number(document.getElementById('expense-others').value) || 0,
            };

            try {
                await setDoc(doc(db, expensesCollectionPath, month), expenseData);
                showToast(`Expenses for ${month} saved!`, "success");
            } catch (error) {
                console.error("Error saving expenses:", error);
                showToast("Failed to save expenses.", "error");
            }
        });

        function handleDeleteSale(e) {
            const docId = e.currentTarget.dataset.id;

            showConfirm(
                "Delete Sale?",
                "Delete this sale entry?",
                async () => {
                    try {
                        await deleteDoc(doc(db, salesCollectionPath, docId));
                        showToast("Sale deleted.", "success");
                    } catch (error) {
                        console.error("Error deleting sale:", error);
                        showToast("Failed to delete sale.", "error");
                    }
                }
            );
        }

        function handleEditSale(e) {
            const docId = e.currentTarget.dataset.id;
            const sale = localSales.find(s => s.id === docId);
            if (!sale) return;

            document.getElementById('edit-sale-id').value = sale.id;
            document.getElementById('edit-sale-date').value = sale.date;
            document.getElementById('edit-sale-product-code').value = sale.code;
            document.getElementById('edit-sale-units').value = sale.unitsSold;
            document.getElementById('edit-sale-price').value = sale.salePrice;

            document.getElementById('edit-sale-modal').classList.remove('hidden');
        }

        document.getElementById('form-edit-sale').addEventListener('submit', async (e) => {
            e.preventDefault();

            const docId = document.getElementById('edit-sale-id').value;
            const date = document.getElementById('edit-sale-date').value;
            const code = document.getElementById('edit-sale-product-code').value;
            const unitsSold = Number(document.getElementById('edit-sale-units').value);
            const salePrice = Number(document.getElementById('edit-sale-price').value);

            if (!date || unitsSold <= 0 || salePrice <= 0) {
                showToast("Please enter valid details.", "error");
                return;
            }

            const product = localInventory[code];
            const originalSale = localSales.find(s => s.id === docId);
            const unitDifference = unitsSold - originalSale.unitsSold;

            if (unitDifference > product.currentUnit) {
                showToast(`Not enough stock. Only ${product.currentUnit} additional units available.`, "error");
                return;
            }

            try {
                const saleDocRef = doc(db, salesCollectionPath, docId);
                await updateDoc(saleDocRef, { date, unitsSold, salePrice });
                showToast("Sale updated!", "success");
                closeEditSaleModal();
            } catch (error) {
                console.error("Error updating sale:", error);
                showToast("Failed to update sale.", "error");
            }
        });

        document.getElementById('edit-sale-cancel').addEventListener('click', closeEditSaleModal);
        function closeEditSaleModal() {
            document.getElementById('edit-sale-modal').classList.add('hidden');
            document.getElementById('form-edit-sale').reset();
        }

        // --- TABS, SEARCH, FILTER ---
        const tabInventory = document.getElementById('tab-inventory');
        const tabSales = document.getElementById('tab-sales');
        const tabExpense = document.getElementById('tab-expense');
        const viewInventory = document.getElementById('view-inventory');
        const viewSales = document.getElementById('view-sales');
        const viewExpense = document.getElementById('view-expense');

        function setActiveTab(activeTab, activeView) {
            const userRole = sessionStorage.getItem('userRole');

            if (userRole === 'employee' && activeTab === tabExpense) {
                return;
            }

            [tabInventory, tabSales, tabExpense].forEach(tab => {
                tab.classList.add('text-gray-500');
                tab.classList.remove('text-blue-600', 'border-blue-600');
            });
            [viewInventory, viewSales, viewExpense].forEach(view => {
                view.classList.add('hidden');
            });

            activeTab.classList.remove('text-gray-500');
            activeTab.classList.add('text-blue-600', 'border-blue-600');
            activeView.classList.remove('hidden');
        }

        tabInventory.addEventListener('click', () => {
            setActiveTab(tabInventory, viewInventory);
        });

        tabSales.addEventListener('click', () => {
            setActiveTab(tabSales, viewSales);
        });

        tabExpense.addEventListener('click', () => {
            setActiveTab(tabExpense, viewExpense);
            const monthFilter = document.getElementById('expense-month-filter');
            if (!monthFilter.value) {
                monthFilter.value = new Date().toISOString().slice(0, 7);
                updateExpenseView();
            }
        });

        document.getElementById('search-inventory').addEventListener('input', renderInventoryTable);

        document.getElementById('month-filter').addEventListener('input', filterAndRenderSales);
        document.getElementById('clear-filter').addEventListener('click', () => {
            document.getElementById('month-filter').value = '';
            filterAndRenderSales();
        });

        function filterAndRenderSales() {
            const filterValue = document.getElementById('month-filter').value;
            let filteredSales = localSales;

            if (filterValue) {
                filteredSales = localSales.filter(sale => {
                    return sale.date.startsWith(filterValue);
                });
            }

            renderSalesTable(filteredSales);
        }

        document.getElementById('expense-month-filter').addEventListener('input', updateExpenseView);

        document.querySelectorAll('.expense-input').forEach(input => {
            input.addEventListener('input', calculateAndDisplayActualProfit);
        });

        document.getElementById('btn-download-inventory').addEventListener('click', () => {
            const categoryFilter = document.getElementById('download-category-filter').value;

            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Code,Category,Current Stock,Cost (Unit),Total Value,Unit Sold,Revenue,Profit/Loss\n";

            let inventoryToDownload = Object.values(localInventory);

            if (categoryFilter !== 'all') {
                inventoryToDownload = inventoryToDownload.filter(item => item.category === categoryFilter);
            }

            inventoryToDownload.forEach(item => {
                const row = [
                    item.code,
                    item.category || '',
                    item.currentUnit,
                    item.cost,
                    item.totalValue,
                    item.unitSold,
                    item.revenue,
                    item.profitLoss
                ].join(",");
                csvContent += row + "\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `inventory_report_${categoryFilter}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast("Report downloaded.", "success");
        });

        // --- UTILITY FUNCTIONS ---
        function populateCategoryDropdowns() {
            const addCategorySelect = document.getElementById('product-category');
            const filterCategorySelect = document.getElementById('download-category-filter');

            addCategorySelect.innerHTML = '<option value="" disabled selected>Select Category</option>';
            filterCategorySelect.innerHTML = '<option value="all">All Categories</option>';

            productCategories.forEach(category => {
                addCategorySelect.insertAdjacentHTML('beforeend', `<option value="${category}">${category}</option>`);
                filterCategorySelect.insertAdjacentHTML('beforeend', `<option value="${category}">${category}</option>`);
            });
        }

        function formatCurrency(value) {
            return Number(value).toFixed(2);
        }

        function showToast(message, type = "success") {
            const toast = document.getElementById('toast');
            const toastMessage = document.getElementById('toast-message');

            toastMessage.textContent = message;
            toast.className = 'fixed bottom-10 right-10 px-5 py-3 rounded-lg text-white';

            if (type === 'success') {
                toast.classList.add('bg-green-600');
            } else if (type === 'error') {
                toast.classList.add('bg-red-600');
            } else {
                toast.classList.add('bg-blue-600');
            }

            toast.classList.remove('hidden');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 3000);
        }

        let confirmCallback = null;
        const confirmModal = document.getElementById('confirm-modal');

        function showConfirm(title, message, callback) {
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            confirmCallback = callback;
            confirmModal.classList.remove('hidden');
        }

        document.getElementById('confirm-cancel').addEventListener('click', () => {
            confirmModal.classList.add('hidden');
            confirmCallback = null;
        });

        document.getElementById('confirm-ok').addEventListener('click', () => {
            if (confirmCallback) {
                confirmCallback();
            }
            confirmModal.classList.add('hidden');
            confirmCallback = null;
        });

        // --- ON PAGE LOAD ---
        window.onload = () => {
            document.getElementById('sale-date').value = new Date().toISOString().split('T')[0];

            const expenseMonthFilter = document.getElementById('expense-month-filter');
            expenseMonthFilter.value = new Date().toISOString().slice(0, 7);

            populateCategoryDropdowns();

            document.getElementById('form-login').addEventListener('submit', handleLogin);
            document.getElementById('btn-logout').addEventListener('click', showLoginView);
            document.getElementById('google-signin-btn').addEventListener('click', signInWithGoogle);

            // Check for traditional user session
            const traditionalUserStr = sessionStorage.getItem('traditionalUser');
            if (traditionalUserStr) {
                const savedUser = JSON.parse(traditionalUserStr);
                const role = sessionStorage.getItem('userRole');
                
                currentUser = savedUser;
                userId = savedUser.uid;

                document.getElementById('userDisplayName').textContent = savedUser.displayName;
                document.getElementById('userEmail').textContent = savedUser.email;
                document.getElementById('userPhoto').classList.add('hidden');

                inventoryCollectionPath = `/artifacts/${appId}/users/${userId}/inventory`;
                salesCollectionPath = `/artifacts/${appId}/users/${userId}/sales`;
                expensesCollectionPath = `/artifacts/${appId}/users/${userId}/expenses`;

                inventoryCollectionRef = collection(db, inventoryCollectionPath);
                salesCollectionRef = collection(db, salesCollectionPath);
                expensesCollectionRef = collection(db, expensesCollectionPath);

                document.getElementById('login-view').classList.add('hidden');
                document.getElementById('app-view').classList.remove('hidden');
                applyRoleRestrictions(role);

                attachFirestoreListeners();
            }
        };