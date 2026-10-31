module.exports = async ({ github, context, core }) => {
    const historyWorkflowRuns = [];
    pageloop: for (let page = 1; true; page++) {
        console.log("list workflow page:", page);

        const perPageLimit = 100;
        const workflowRunsResponse = await github.rest.actions.listWorkflowRuns({
            owner: context.repo.owner,
            repo: context.repo.repo,
            workflow_id: "sync.yaml",
            per_page: perPageLimit,
            page,
        });

        if (workflowRunsResponse.status !== 200) {
            console.log("list workflow page error", "page:", page);
            return;
        }

        const list = workflowRunsResponse.data.workflow_runs;
        for (const item of list) {
            console.log("delete workflow run", "id:", item.id);

            if (item.id === context.runId) {
                console.log("skip current workflow run");
                continue;
            }
            const deleteWorkflowRunResponse = await github.rest.actions.deleteWorkflowRun({
                owner: context.repo.owner,
                repo: context.repo.repo,
                run_id: item.id,
            });

            if (deleteWorkflowRunResponse.status !== 204) {
                console.log("delete workflow run error", "status code:", deleteWorkflowRunResponse.status);
                return;
            }
        }

        if (list.length < perPageLimit) {
            console.log("list workflow page over");
            break;
        }
    }
}
