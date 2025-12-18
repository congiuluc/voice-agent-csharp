async function fetchAgentsForProject(projectId) {
    try {
        const url = `/Api/FoundryAgents?projectId=${encodeURIComponent(projectId)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(window.APP_RESOURCES?.FailedToFetchAgents || 'Failed to fetch agents');
        const agents = await resp.json();
        return agents;
    } catch (err) {
        console.error('Error fetching agents for project', err);
        return [];
    }
}

export async function refreshAgents() {
    const projectSelect = document.getElementById('foundryProjectSelect');
    const agentSelect = document.getElementById('foundryAgentSelect');

    if (!projectSelect || !agentSelect) return;

    const projectId = projectSelect.value || 'all';
    const agents = await fetchAgentsForProject(projectId);
    
    // Store current selection to try and restore it
    const currentAgentId = agentSelect.value;
    
    agentSelect.innerHTML = '';
    agents.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id || a.Id || '';
        opt.textContent = a.name || a.Name || (window.APP_RESOURCES?.UnnamedAgent || 'Unnamed agent');
        agentSelect.appendChild(opt);
    });
    
    // Restore selection if it still exists in the new list
    if (currentAgentId) {
        agentSelect.value = currentAgentId;
    }
}

export async function wireFoundryUi() {
    const projectSelect = document.getElementById('foundryProjectSelect');
    if (!projectSelect) return;

    projectSelect.addEventListener('change', refreshAgents);

    // initial load
    await refreshAgents();
}

// Auto-wire when module loaded by the main app
if (typeof window !== 'undefined') {
    // Delay wiring until DOM is ready; if using main app.js it can call wireFoundryUi explicitly
    document.addEventListener('DOMContentLoaded', () => {
        // Do not error if dynamic import not supported
    });
}
