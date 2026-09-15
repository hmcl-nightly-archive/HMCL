const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

module.exports = async ({ github, context, core }) => {
    const BASE_DIR = path.dirname(__filename);
    const DATA_DIR = path.join(BASE_DIR, "data");
    fs.existsSync(DATA_DIR) || fs.mkdirSync(DATA_DIR);
    const CURRENT_WORKFLOW_RUN_ID_PATH = path.join(DATA_DIR, "current-workflow-id");
    let currentWorkflowId = fs.existsSync(CURRENT_WORKFLOW_RUN_ID_PATH) ? (Number(fs.readFileSync(CURRENT_WORKFLOW_RUN_ID_PATH, "utf8").trim()) || 0) : 0;
    console.log("currentWorkflowId:", currentWorkflowId);

    const workflowRuns = [];
    pageloop: for (let page = 1; true; page++) {
        console.log("list workflow page:", page);

        const workflowRunsResponse = await github.rest.actions.listWorkflowRuns({
            branch: "main",
            event: "push",
            status: "success",
            per_page: 100,
            page,
            owner: "HMCL-dev",
            repo: "HMCL",
            workflow_id: "gradle.yml",
        });

        if (workflowRunsResponse.status !== 200) {
            console.log("list workflow page error", "page:", page);
            return;
        }

        if (workflowRunsResponse.data.total_count === 0 || workflowRunsResponse.data.workflow_runs.length === 0) {
            console.log("list workflow page over");
            break;
        }

        const list = workflowRunsResponse.data.workflow_runs;
        for (const item of list) {
            if (item.id <= currentWorkflowId) {
                console.log("list workflow page over");
                break pageloop;
            }
            workflowRuns.push(item);
        }
    }

    for (let i = workflowRuns.length - 1; i >= 0; i--) {
        const workflowRun = workflowRuns[i];

        let message = workflowRun.display_title;
        if (workflowRun.head_commit === null) {
            const getCommitResponse = await github.rest.git.getCommit({
                owner: "HMCL-dev",
                repo: "HMCL",
                commit_sha: workflowRun.head_sha
            });

            if (getCommitResponse.status !== 200) {
                console.log("workflow run:", workflowRun.id, "head commit is null and not found commit:", workflowRun.head_sha);
                return;
            }

            message = getCommitResponse.data.message;
        } else {
            message = workflowRun.head_commit.message;
        }

        console.log("workflow run:", workflowRun.id, "message:", message);

        const tag = `v${workflowRun.id}`;

        try {
            const result = execSync(`git tag ${tag} ${workflowRun.head_sha}`, { encoding: "utf-8" });
            console.log("workflow run:", workflowRun.id, "create tag:", result);
        } catch (error) {
            if (error.message.includes(`nonexistent object ${workflowRun.head_sha}`)) {
                try {
                    const result = execSync(`git fetch origin ${workflowRun.head_sha}:${workflowRun.head_sha}`, { encoding: "utf-8" });
                    console.log("workflow run:", workflowRun.id, "fetch commit:", result);
                } catch (error) {
                    console.log("workflow run:", workflowRun.id, "fetch commit error:", error);
                    return;
                }

                try {
                    const result = execSync(`git tag ${tag} ${workflowRun.head_sha}`, { encoding: "utf-8" });
                    console.log("workflow run:", workflowRun.id, "create tag:", result);
                } catch (error) {
                    console.log("workflow run:", workflowRun.id, "create tag error:", error);
                    return;
                }
            } else {
                console.log("workflow run:", workflowRun.id, "create tag error:", error);
                return;
            }
        }

        try {
            const result = execSync(`git push -f hna ${tag}`, { encoding: "utf-8" });
            console.log("workflow run:", workflowRun.id, "push tag:", result);
        } catch (error) {
            console.log("workflow run:", workflowRun.id, "push tag error:", error);
            return;
        }

        if (workflowRun.id <= currentWorkflowId) {
            console.log("workflow run:", workflowRun.id, "alreay exist");
            continue;
        }

        console.log("workflow run:", workflowRun.id, "use workflow run artiface");

        const listWorkflowRunArtifactsResponse = await github.rest.actions.listWorkflowRunArtifacts({
            owner: "HMCL-dev",
            repo: "HMCL",
            run_id: workflowRun.id,
        });

        if (listWorkflowRunArtifactsResponse.status !== 200) {
            console.log("workflow run:", workflowRun.id, "list workflow run artiface error status code:", listWorkflowRunArtifactsResponse.status);
            return;
        }

        const artifacts = listWorkflowRunArtifactsResponse.data.artifacts;
        if ((workflowRun.id < 24950340514 && artifacts.length !== 3) || (workflowRun.id >= 24950340514 && artifacts.length !== 4)) {
            console.log("workflow run:", workflowRun.id, "list workflow error", "artiface count:", artifacts.length);
            return;
        }

        const createRelease = await github.rest.repos.createRelease({
            owner: context.repo.owner,
            repo: context.repo.repo,
            tag_name: tag,
            name: tag,
            body: message,
            prerelease: true,
            draft: true,
        });

        if (createRelease.status !== 201) {
            console.log("workflow run:", workflowRun.id, "create release:", tag, "error status code:", createRelease.status);
            return;
        }

        const releaseId = createRelease.data.id;

        for (const artifact of artifacts) {
            console.log("download:", artifact.name);

            const downloadArtifactResponse = await github.rest.actions.downloadArtifact({
                owner: "HMCL-dev",
                repo: "HMCL",
                artifact_id: artifact.id,
                archive_format: "zip",
            });

            if (downloadArtifactResponse.status !== 200) {
                console.log("workflow run:", workflowRun.id, "download artiface", "error status code:", downloadArtifactResponse.status);
                return;
            }

            const uploadReleaseAssetResponse = await github.rest.repos.uploadReleaseAsset({
                owner: context.repo.owner,
                repo: context.repo.repo,
                name: artifact.name,
                release_id: releaseId,
                data: downloadArtifactResponse.data,
            });

            if (uploadReleaseAssetResponse.status !== 201) {
                console.log("workflow run:", workflowRun.id, "upload release asset:", artifact.name, "error status code:", uploadReleaseAssetResponse.status);
                return;
            }
        }

        const updateReleaseResponse = await github.rest.repos.updateRelease({
            owner: context.repo.owner,
            repo: context.repo.repo,
            release_id: releaseId,
            prerelease: true,
            draft: false
        });

        if (updateReleaseResponse.status !== 200) {
            console.log("workflow run:", workflowRun.id, "update release", "error status code:", updateReleaseResponse.status);
            return;
        }

        currentWorkflowId = workflowRun.id;
        fs.writeFileSync(CURRENT_WORKFLOW_RUN_ID_PATH, String(currentWorkflowId), "utf8");
    }
}
