const fs = require("fs");
const path = require("path");
const { getProperties } = require("properties-file");

module.exports = async ({ github, context, core }) => {
    const BASE_DIR = path.dirname(__filename);
    const ROOT_DIR = path.join(BASE_DIR, "../../..");
    const DATA_DIR = path.join(BASE_DIR, "data");
    fs.existsSync(DATA_DIR) || fs.mkdirSync(DATA_DIR);
    const I18N_HASH_PATH = path.join(DATA_DIR, "i18n-hash");
    const i18nHash = fs.readFileSync(I18N_HASH_PATH, "utf8").trim();
    console.log("i18nHash:", i18nHash);
    const CURRENT_I18N_HASH_PATH = path.join(DATA_DIR, "current-i18n-hash");
    let currentI18nHash = fs.existsSync(CURRENT_I18N_HASH_PATH) ? fs.readFileSync(CURRENT_I18N_HASH_PATH, "utf8").trim() : null;
    console.log("currentI18nHash:", currentI18nHash);
    if (currentI18nHash === i18nHash) {
        fs.unlinkSync(I18N_HASH_PATH);
        console.log("i18n hash not found new change");
        return;
    }

    const I18N_REPORT_PATH = path.join(DATA_DIR, "i18n-report.md");
    const I18N_DIR = path.join(ROOT_DIR, "HMCL/src/main/resources/assets/lang");
    console.log("i18n dir:", I18N_DIR);
    const i18nFolder = fs.readdirSync(I18N_DIR);

    const langs = {
        default: {
            label: "默认（英语）",
        },
        ar: {
            label: "阿拉伯语",
        },
        de: {
            label: "德语",
        },
        es: {
            label: "西班牙语",
        },
        ja: {
            label: "日语",
        },
        lzh: {
            label: "汉语（文言）",
        },
        ru: {
            label: "俄语",
        },
        uk: {
            label: "乌克兰语",
        },
        zh: {
            label: "汉语（繁体）",
        },
        zh_CN: {
            label: "汉语（简体）",
        },
    }

    const i18nMap = new Map();
    for (const i18nFile of i18nFolder) {
        if (!i18nFile.startsWith("I18N") || !i18nFile.endsWith(".properties")) {
            continue;
        }
        const code = i18nFile === "I18N.properties" ? "default" : i18nFile.slice(5, -11);
        console.log("i18n file:", i18nFile, "lang code:", code);
        const i18nFilePath = path.join(I18N_DIR, i18nFile);
        if (langs[code] === undefined) {
            langs[code] = {};
        }
        langs[code].path = path.relative(ROOT_DIR, i18nFilePath);
        const data = getProperties(fs.readFileSync(i18nFilePath, "utf8"));
        i18nMap.set(code, data);
    }

    const allKeys = new Set();
    for (const data of i18nMap.values()) {
        Object.keys(data).forEach(key => allKeys.add(key));
    }

    let markdown = `# I18N 状态报告\n\n`;
    markdown += `> [!NOTE]\n`;
    markdown += `> 报告由 [${context.repo.owner}/${context.repo.repo}#${context.runId}](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}) 生成\n`;
    markdown += `> 生成时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} (Asia/Shanghai)\n\n`;
    markdown += `## 总览\n\n`;
    markdown += `| 语言 | 键数量 | 缺失键 |\n`;
    markdown += `|---|---:|---:|\n`;
    const missingMap = new Map();
    for (const [code, data] of i18nMap) {
        const missing = [];
        for (const key of allKeys) {
            if (!(key in data)) {
                missing.push(key);
            }
        }
        missingMap.set(code, missing);

        const lang = langs[code];
        const href = lang.path !== undefined ? "https://github.com/HMCL-dev/HMCL/tree/main/" + lang.path : undefined;
        markdown += `| ${ lang !== undefined ? `[${lang.label ?? code}](${href ?? "#not-fount"})` : code } | ${Object.keys(data).length} | ${missing.length} |\n`;
    }

    markdown += `\n\n## 缺失键\n\n`;
    for (const [code, missing] of missingMap) {
        if (missing.length === 0) {
            continue;
        }

        const lang = langs[code];
        markdown += `<details><summary><strong>${ lang !== undefined && lang.label !== undefined ? lang.label : code }</strong></summary><hr>\n\n`;
        for (const key of missing) {
            markdown += `- ${key}\n`;
        }
        markdown += "</details>";
    }

    core.summary.addRaw(markdown, true).write();
    fs.writeFileSync(I18N_REPORT_PATH, markdown, "utf8");
    console.log(`report path: ${I18N_REPORT_PATH}`);

    const I18N_REPORT_ISSUE_PATH = path.join(DATA_DIR, "i18n-report-issue");
    let i18nReportIssue = fs.existsSync(I18N_REPORT_ISSUE_PATH) ? fs.readFileSync(I18N_REPORT_ISSUE_PATH, "utf8").trim() : null;
    console.log("i18nReportIssue:", i18nReportIssue);

    if (i18nReportIssue === null) {
        console.log("create i18 report");

        const createIssueResponse = await github.rest.issues.create({
            owner: "HMCL-dev",
            repo: "HMCL",
            title: "I18N 状态报告",
        });

        if (createIssueResponse.status !== 201) {
            console.log("create i18n report issue error", "status code:", createIssueResponse.status);
            return;
        }

        i18nReportIssue = createIssueResponse.data.number;
        fs.writeFileSync(I18N_REPORT_ISSUE_PATH, String(i18nReportIssue), "utf8");
    }

    const I18N_REPORT_ISSUE_COMMENT_PATH = path.join(DATA_DIR, "i18n-report-issue-comment");
    let i18nReportIssueComment = fs.existsSync(I18N_REPORT_ISSUE_COMMENT_PATH) ? fs.readFileSync(I18N_REPORT_ISSUE_COMMENT_PATH, "utf8").trim() : null;
    console.log("i18nReportIssueComment:", i18nReportIssueComment);

    if (i18nReportIssueComment === null) {
        console.log("create i18 report comment");

        const createIssueCommentResponse = await github.rest.issues.createComment({
            owner: "HMCL-dev",
            repo: "HMCL",
            body: markdown,
            issue_number: i18nReportIssue,
        });

        if (createIssueCommentResponse.status !== 201) {
            console.log("create i18n report issue comment error", "status code:", createIssueCommentResponse.status);
            return;
        }

        i18nReportIssueComment = createIssueCommentResponse.data.id;
        fs.writeFileSync(I18N_REPORT_ISSUE_COMMENT_PATH, String(i18nReportIssueComment), "utf8");
    } else {
        console.log("update i18 report comment");

        const updateIssueCommentResponse = await github.rest.issues.updateComment({
            owner: "HMCL-dev",
            repo: "HMCL",
            body: markdown,
            comment_id: i18nReportIssueComment,
        });

        if (updateIssueCommentResponse.status !== 200) {
            console.log("update i18n report issue comment error", "status code:", updateIssueCommentResponse.status);
            return;
        }
    }

    fs.existsSync(CURRENT_I18N_HASH_PATH) && fs.unlinkSync(CURRENT_I18N_HASH_PATH);
    fs.renameSync(I18N_HASH_PATH, CURRENT_I18N_HASH_PATH);
}
