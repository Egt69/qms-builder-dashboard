import { createPublicClient, createWalletClient, http, defineChain, formatEther, isAddress, isHash, custom } from 'https://esm.sh/viem';
import { createStore } from 'https://esm.sh/mipd';

// --- ABI ERC-20 ---
const erc20Abi = [
    { "constant": true, "inputs": [], "name": "name", "outputs": [{"name": "", "type": "string"}], "type": "function" },
    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{"name": "", "type": "string"}], "type": "function" },
    { "constant": true, "inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "type": "function" },
    { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{"name": "", "type": "uint256"}], "type": "function" }
];

// --- WEB WORKER SOLC ---
const workerCode = `
importScripts('https://binaries.soliditylang.org/bin/soljson-v0.8.20+commit.a1b79de6.js');
self.addEventListener('message', (e) => {
    const { source } = e.data;
    const compiler = self.Module.cwrap('solidity_compile', 'string', ['string']);
    const input = JSON.stringify({ language: 'Solidity', sources: { 'token.sol': { content: source } }, settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } });
    try { const output = JSON.parse(compiler(input)); self.postMessage({ success: true, output }); } 
    catch (error) { self.postMessage({ success: false, error: error.message }); }
});
`;
const compilerWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));

// --- QMS NETWORK ---
const qmsTestnet = defineChain({
    id: 19480, name: 'QMS Testnet', nativeCurrency: { name: 'QMS', symbol: 'QMS', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.testnet.qms.finance'] } },
    blockExplorers: { default: { name: 'QMS Explorer', url: 'https://testnet.qmsscan.io' } },
});
const publicClient = createPublicClient({ chain: qmsTestnet, transport: http() });

// --- WALLET LOGIC (EIP-6963) ---
const store = createStore();
let activeProvider = null;
let connectedAccount = null;
const walletDropdown = document.getElementById('walletDropdown');
const connectBtn = document.getElementById('headerConnectBtn');

function renderWalletOptions() {
    const providers = store.getProviders();
    if (providers.length === 0) return walletDropdown.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">No wallet detected.</div>';
    walletDropdown.innerHTML = providers.map(p => `<button class="wallet-option" data-rdns="${p.info.rdns}"><img src="${p.info.icon}">${p.info.name}</button>`).join('');
    walletDropdown.querySelectorAll('.wallet-option').forEach(btn => {
        btn.addEventListener('click', async () => {
            const providerDetail = store.findProvider({ rdns: btn.dataset.rdns });
            if (providerDetail) { await connectWallet(providerDetail); walletDropdown.classList.remove('show'); }
        });
    });
}

async function connectWallet(providerDetail) {
    try {
        activeProvider = providerDetail.provider;
        const accounts = await activeProvider.request({ method: 'eth_requestAccounts' });
        connectedAccount = accounts[0];
        connectBtn.innerText = `${connectedAccount.slice(0,6)}...${connectedAccount.slice(-4)}`;
        connectBtn.style.background = "var(--success)";
    } catch (err) { console.error(err); }
}

store.subscribe(renderWalletOptions);
renderWalletOptions();

// --- TOMBOL CONNECT / DISCONNECT ---
connectBtn.addEventListener('click', async () => {
    // JIKA SUDAH TERHUBUNG, MAKA KLIK = DISCONNECT
    if (connectedAccount) {
        if (confirm("Disconnect wallet from QMS Dashboard?")) {
            connectedAccount = null;
            activeProvider = null;
            connectBtn.innerText = "Connect Wallet";
            connectBtn.style.background = "var(--primary)";
            // Bersihkan status di tab Dev Tools jika ada
            document.getElementById('wallet-status').innerHTML = '';
            document.getElementById('deploy-status').innerHTML = '';
        }
        return;
    }

    // JIKA BELUM TERHUBUNG, MAKA KLIK = CONNECT
    const providers = store.getProviders();
    if (providers.length === 1) await connectWallet(providers[0]);
    else if (providers.length > 1) walletDropdown.classList.toggle('show');
    else alert("No compatible wallet found. Please install MetaMask or Rabby.");
});

document.addEventListener('click', (e) => { if (!connectBtn.contains(e.target) && !walletDropdown.contains(e.target)) walletDropdown.classList.remove('show'); });

// --- NAVIGATION ---
window.openTab = function(tabName, btn) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    btn.classList.add('active');
}

// --- HEALTH ---
async function loadHealthData() {
    try {
        const latest = await publicClient.getBlockNumber();
        const blocks = [];
        for (let i = 0; i < 5; i++) blocks.push(await publicClient.getBlock({ blockNumber: latest - BigInt(i) }));
        let totalTime = 0; for (let i = 0; i < 4; i++) totalTime += Number(blocks[i].timestamp) - Number(blocks[i + 1].timestamp);
        document.getElementById('avgBlockTime').innerText = (totalTime / 4).toFixed(2) + 's';
        const start = performance.now(); await publicClient.getBlockNumber();
        document.getElementById('rpcLatency').innerText = Math.round(performance.now() - start) + 'ms';
        document.getElementById('recentBlocksList').innerHTML = blocks.map(b => `<div class="list-item"><div><div class="item-title">Block #${b.number}</div><div class="item-desc">${b.transactions.length} Txs</div></div><div class="item-right">${new Date(Number(b.timestamp)*1000).toLocaleTimeString()}</div></div>`).join('');
    } catch (e) { document.getElementById('recentBlocksList').innerHTML = `<div class="status-msg error">Error: ${e.message}</div>`; }
}
loadHealthData(); setInterval(loadHealthData, 15000);

// --- SEARCH ---
document.getElementById('searchBtn').addEventListener('click', async (e) => {
    const query = document.getElementById('searchInput').value.trim();
    const out = document.getElementById('search-output');
    if (!query) return;
    e.target.innerText = "Searching..."; e.target.disabled = true; out.innerHTML = '<div class="status-msg warning">🔍 Mencari...</div>';
    try {
        if (isHash(query)) {
            const tx = await publicClient.getTransaction({ hash: query });
            const receipt = await publicClient.getTransactionReceipt({ hash: query });
            const statusBadge = receipt.status === 'success' ? '<span style="color:var(--success);">Success</span>' : '<span style="color:#ef4444;">Failed</span>';
            out.innerHTML = `<div class="card" style="border-color: var(--primary);"><div class="card-header" style="justify-content: space-between;">Transaction ${statusBadge}</div><div class="list-item"><div class="item-desc">Hash</div><div class="item-title" style="font-size: 0.9rem;">${tx.hash}</div></div><div class="list-item"><div class="item-desc">From</div><div class="item-title" style="font-size: 0.9rem;">${tx.from}</div></div></div>`;
        } else if (isAddress(query)) {
            let isToken = false; let tokenData = null;
            try {
                const [name, symbol, decimals, totalSupply] = await Promise.all([
                    publicClient.readContract({ address: query, abi: erc20Abi, functionName: 'name' }),
                    publicClient.readContract({ address: query, abi: erc20Abi, functionName: 'symbol' }),
                    publicClient.readContract({ address: query, abi: erc20Abi, functionName: 'decimals' }),
                    publicClient.readContract({ address: query, abi: erc20Abi, functionName: 'totalSupply' })
                ]);
                isToken = true; tokenData = { name, symbol, decimals, totalSupply };
            } catch (err) { isToken = false; }

            if (isToken) {
                out.innerHTML = `<div class="card" style="border-color: var(--accent);"><div class="card-header" style="color: var(--accent);">ERC-20 Token</div><div class="list-item"><div class="item-desc">Name</div><div class="item-title" style="color: var(--success);">${tokenData.name}</div></div><div class="list-item"><div class="item-desc">Symbol</div><div class="item-title">${tokenData.symbol}</div></div><div class="list-item"><div class="item-desc">Supply</div><div class="item-title">${formatEther(tokenData.totalSupply)} ${tokenData.symbol}</div></div></div>`;
            } else {
                const bal = await publicClient.getBalance({ address: query });
                const txCount = await publicClient.getTransactionCount({ address: query });
                out.innerHTML = `<div class="card"><div class="card-header">Wallet</div><div class="list-item"><div class="item-desc">Balance</div><div class="item-title" style="color: var(--success);">${formatEther(bal)} QMS</div></div><div class="list-item"><div class="item-desc">Tx Count</div><div class="item-title">${txCount}</div></div></div>`;
            }
        } else { out.innerHTML = `<div class="status-msg error">Invalid format.</div>`; }
    } catch (err) { out.innerHTML = `<div class="status-msg error">Not found: ${err.message}</div>`; }
    e.target.innerText = "Search"; e.target.disabled = false;
});

// --- DEV TOOLS ---
document.getElementById('addNetworkBtn').addEventListener('click', async () => {
    const status = document.getElementById('wallet-status');
    if (!activeProvider) return status.innerHTML = '<div class="status-msg error">Connect wallet first.</div>';
    try {
        await activeProvider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x4c18', chainName: 'QMS Testnet', nativeCurrency: { name: 'QMS', symbol: 'QMS', decimals: 18 }, rpcUrls: ['https://rpc.testnet.qms.finance'], blockExplorerUrls: ['https://testnet.qmsscan.io'] }] });
        status.innerHTML = '<div class="status-msg success">✅ Added!</div>';
    } catch (err) { status.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`; }
});

document.getElementById('checkRpcBtn').addEventListener('click', async (e) => {
    const status = document.getElementById('rpc-status'); e.target.innerText = "Pinging..."; e.target.disabled = true;
    const start = performance.now();
    try { await publicClient.getBlockNumber(); status.innerHTML = `<div class="status-msg success">✅ Online (${(performance.now() - start).toFixed(0)}ms)</div>`; }
    catch { status.innerHTML = `<div class="status-msg error">❌ Offline</div>`; }
    e.target.innerText = "Ping RPC Node"; e.target.disabled = false;
});

// --- FACTORY ---
document.getElementById('deployTokenBtn').addEventListener('click', async (e) => {
    const btn = e.target; const status = document.getElementById('deploy-status');
    const name = document.getElementById('tokenName').value;
    const symbol = document.getElementById('tokenSymbol').value;
    const supply = document.getElementById('tokenSupply').value;
    if (!name || !symbol || !supply) return status.innerHTML = '<div class="status-msg error">Fill all fields.</div>';
    if (!activeProvider) return status.innerHTML = '<div class="status-msg error">Connect wallet first.</div>';

    btn.innerText = "Deploying..."; btn.disabled = true; status.innerHTML = '<div class="status-msg warning">⏳ Compiling...</div>';
    try {
        try { await activeProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x4c18' }] }); } 
        catch (err) { if (err.code === 4902) await activeProvider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x4c18', chainName: 'QMS Testnet', nativeCurrency: { name: 'QMS', symbol: 'QMS', decimals: 18 }, rpcUrls: ['https://rpc.testnet.qms.finance'], blockExplorerUrls: ['https://testnet.qmsscan.io'] }] }); else throw err; }

        const source = `// SPDX-License-Identifier: MIT
        pragma solidity ^0.8.20;
        contract MyToken {
            string public name; string public symbol; uint8 public decimals = 18; uint256 public totalSupply;
            mapping(address => uint256) public balanceOf;
            constructor(string memory _name, string memory _symbol, uint256 _supply) { name = _name; symbol = _symbol; totalSupply = _supply * 10**18; balanceOf[msg.sender] = totalSupply; }
        }`;

        const compileResult = await new Promise((resolve, reject) => {
            compilerWorker.onmessage = (e) => { if (e.data.success) resolve(e.data.output); else reject(new Error(e.data.error)); };
            compilerWorker.postMessage({ source });
        });

        const bytecode = '0x' + compileResult.contracts['token.sol']['MyToken'].evm.bytecode.object;
        const abi = compileResult.contracts['token.sol']['MyToken'].abi;

        status.innerHTML = '<div class="status-msg warning">⏳ Confirm in wallet...</div>';
        const walletClient = createWalletClient({ chain: qmsTestnet, transport: custom(activeProvider) });
        const [account] = await walletClient.requestAddresses();
        const hash = await walletClient.deployContract({ abi, bytecode, args: [name, symbol, BigInt(supply)], account });

        status.innerHTML = '<div class="status-msg warning">⏳ Mining...</div>';
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const ca = receipt.contractAddress;
        
        status.innerHTML = `<div class="status-msg success" style="padding: 1.5rem;"><h4 style="color:var(--success); margin-bottom:1rem;">✅ Deployed!</h4><div style="font-size:0.85rem; color:var(--text-muted);">CA:</div><div style="display:flex; gap:0.5rem; margin-top:0.5rem;"><input type="text" readonly value="${ca}" class="copy-input"><button onclick="navigator.clipboard.writeText('${ca}'); this.innerText='Copied!'; setTimeout(() => this.innerText='Copy', 2000);" class="btn-copy">Copy</button></div></div>`;
    } catch (err) { status.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`; }
    btn.innerText = "Deploy Token to QMS"; btn.disabled = false;
});
