const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

const token = core.getInput(`token_action`, { required: true });
const name_label = core.getInput(`name_label`, { required: true });
const uri_hook = core.getInput(`uri_notice`, { required: true });
const mentions = core.getInput(`mentions`, { required: true });

const mentioned_list = mentions.split(",");
const arr_name_labels = name_label.split(",");


const oc = github.getOctokit(token);

const repo = github.context.repo;

async function run() {
    let number = github.context.payload.issue.number
    let {data:issue,status:status} = await getIssueDetails(repo,number)
    let state_self = false
    let message = `issue [${issue.title}](${issue.html_url}) is closed and it needs to be checked`
    for (let label of issue.labels) {
        let flag = false
        for (let i = 0; i < arr_name_labels.length; i++) {
            const name = arr_name_labels[i];
            if (label.name == name) {
                state_self = true
                flag = true
                break
            }
        }
        if (flag) {
            break
        }
    }
    
    let state_parent = false
    let parent = new Set()

    let isSub = isSubtask(issue.title)
    if (isSub) {
        core.info(`This issue is a subtask, so will check parent issue`)
        let issues = await getParentIssue(issue.body)
        for (let issue_t of issues) {
            let labels = issue_t.labels
            let flag = false
            for (let i = 0; i < labels.length; i++) {
                const label = labels[i];
                for (let j = 0; j < arr_name_labels.length; j++) {
                    const name = arr_name_labels[j];
                    if (label.name == name) {
                        parent.add(issue_t)
                        flag = true
                        state_parent = true
                        break
                    }
                }
                if (flag) {
                    break
                }
            }
        }
    }
    if (state_self || state_parent) {
        if (isSub && parent.length != 0) {
            message += `, the parent issues is: `
            for (let issue_t of parent) {
                message += `[${issue_t.repository_url.split(`/`).slice(-1)}/${issue_t.number}](${issue_t.html_url}),`
            }
            message = message.substring(0,message.length-1)
        }
        notice_WeCom(`markdown`, message)
    } else {
        core.info(`This issue do not have any need check label, skip its`)
    }
}


async function notice_WeCom(type, message) {
    let notice_payload = {};
    switch (type) {
        case `text`:
            notice_payload = {
                msgtype: `text`,
                text: {
                    content: message,
                    mentioned_list: mentioned_list
                },
            };
            break;
        case `markdown`:
            for (let i = 0; i < mentioned_list.length; i++) {
                const man = mentioned_list[i];
                message += `<@${man}>`
            }
            notice_payload = {
                msgtype: `markdown`,
                markdown: {
                    content: message
                },
            }
            break;
        default:
            break;
    }
    core.info(JSON.stringify(notice_payload))
    let resp = await axios.post(uri_hook, JSON.stringify(notice_payload), {
        Headers: {
            'Content-Type': 'application/json'
        }
    });
    return resp.status;
    return 200
}

async function getIssueDetails({owner,repo},number) {
    let { data: issue, status: status } = await oc.rest.issues.get({
        owner: owner,
        repo:repo,
        issue_number: number
    });
    return { data: issue, status: status };
}

function isSubtask(title) {
    return /^\[Subtask\]:/igm.test(title)
}

async function getParentIssue(body) {
    let issues = new Set()
    const totalReg = /^### Parent Issue(.*)### Detail of Subtask/igms
    let result = totalReg.exec(body)
    if (result === null || result[1].length == 0) {
        return Array.from(issues)
    }
    body = result[1]

    const pubReg = /#(\d+)/img
    result = body.match(pubReg)
    if (result !== null) {
        if (result.length != 0) {
            for (let i = 0; i < result.length; i++) {
                const e = result[i];
                issues.add((await getIssueDetails(repo, e.substring(1))).data)
            }
        }
    }


    const priReg = /https:\/\/github.com\/(.+)\/(.+)\/issues\/(\d+)/igm
    result = body.matchAll(priReg)
    result = Array.from(result)
    if (result === null) {
        return Array.from(issues)
    }
    if (result.length != 0) {
        for (let i = 0; i < result.length; i++) {
            const res = result[i];
            issues.add((await getIssueDetails({ owner: res[1], repo: res[2] }, res[3])).data)
        }
    }
    return Array.from(issues)
}

run();
