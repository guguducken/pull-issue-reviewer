const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

const token = core.getInput(`token_action`, { required: true });
const id_labels = core.getInput(`id_labels`, { required: true });
const uri_hook = core.getInput(`uri_notice`, { required: true });
const mentions = core.getInput(`mentions`, { required: true });

const mentioned_list = mentions.split(",");
const arr_id_labels = id_labels.split(",");


const oc = github.getOctokit(token);

async function run() {
    let number = github.context.payload.issue.number
    let {data:issue,status:status} = await getIssueDetails(number)
    let labels = issue.labels
    let flag = false
    for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        for (let j = 0; j < arr_id_labels.length; j++) {
            const id = arr_id_labels[j];
            if (label.id == id) {
                flag = true
                break
            }
        }
        if (flag) {
            break
        }
    }
    if (flag) {
        let message = `issue [${issue.title}](${issue.html_url}) is closed and it needs to be checked`
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
    let resp = await axios.post(uri_hook, JSON.stringify(notice_payload), {
        Headers: {
            'Content-Type': 'application/json'
        }
    });
    return resp.status;
}

async function getIssueDetails(number) {
    let { data: issue, status: status } = await oc.rest.issues.get({
        ...github.context.repo,
        issue_number: number
    });
    return { data: issue, status: status };
}

run();