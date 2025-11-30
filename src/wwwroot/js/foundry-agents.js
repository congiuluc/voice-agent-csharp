async function fetchAgentsForProject(projectId) {
    try {
        const url = `/Api/FoundryAgents?projectId=${encodeURIComponent(projectId)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed to fetch agents');
        const agents = await resp.json();
        return agents;
    } catch (err) {
        console.error('Error fetching agents for project', err);
        return [];
    }
}

export async function wireFoundryUi() {
    const projectSelect = document.getElementById('foundryProjectSelect');
    const agentSelect = document.getElementById('foundryAgentSelect');

    if (!projectSelect || !agentSelect) return;

    async function loadAgentsForCurrentProject() {
        const projectId = projectSelect.value || 'all';
        const agents = await fetchAgentsForProject(projectId);
        agentSelect.innerHTML = '';
        agents.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id || a.Id || '';
            opt.textContent = a.name || a.Name || 'Unnamed agent';
            agentSelect.appendChild(opt);
        });
    }

    projectSelect.addEventListener('change', loadAgentsForCurrentProject);

    // initial load
    await loadAgentsForCurrentProject();
}

// Auto-wire when module loaded by the main app
if (typeof window !== 'undefined') {
    // Delay wiring until DOM is ready; if using main app.js it can call wireFoundryUi explicitly
    document.addEventListener('DOMContentLoaded', () => {
        // Do not error if dynamic import not supported
    });
}
