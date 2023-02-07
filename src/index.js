const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');

const token = core.getInput(`token_action`, { required: true });
const id_label = core.getInput(`id_label`, { required: true });
const uri_hook = core.getInput(`uri_notice`, { required: true });
const mentions = core.getInput(`mentions`, { required: true });
const reviewers = core.getInput(`reviewers`, { required: true });

const arr_reviewers = reviewers.split(",");
const mentioned_list = mentions.split(",");

const repo = {
    repo: "matrixone",
    owner: "matrixorigin"
}


const oc = github.getOctokit(token);

async function run() {
    let page = 1;
    let per_page = 100;
    let num_try = 0;
    core.info(`Start to find releate pull request...`)
    while (true) {
        core.info(`Start to fetch the date of page ${page} >>>>>>`);
        let prs = await getPRs(page, per_page);
        if (prs === null) {
            if (num_try == 10) {
                throw new Error(`Get pull request timeout for ten times, please check your internat`);
            }
            num_try++
            core.info(`Get pull request timeout, will try again... ${num_try}`);
            continue;
        }
        num_try = 0;
        core.info(`Get total pull: ${prs.length} of page ${page}`);
        //对每一个pr进行处理
        for (let i = 0; i < prs.length; i++) {

            const pr = prs[i];
            core.info(`\nStart to check pull ${pr.number}, title: ${pr.title} >>>>>>`);
            if (pr.body === null) {
                core.info(`There is no body in is pr ${pr.number}..... skip`);
                continue;
            }
            let num_issues = getReleatedIssueNumber(pr.body);

            if (num_issues.length != 0) {
                core.info(`Get releated issues total: ${num_issues.length}, is ${num_issues}`);
            } else {
                core.info(`Get releated issues total: ${num_issues.length}, so skip this pull`);
                continue;
            }
            for (let j = 0; j < num_issues.length; j++) {
                const num = num_issues[j];
                let flag = false;
                let issue = await getIssueDetails(num);
                if (issue.pull_request !== undefined) {
                    core.info(`This is a pr -- ${num}... skip`);
                    continue;
                }
                for (let k = 0; k < issue.data.labels.length; k++) {
                    const label = issue.data.labels[k];
                    if (label.id == id_label) {
                        let sum = 0
                        //增加reviewer
                        while (await addReviewers(pr.number, await reviewersHasCheck(pr.number)) == false) {
                            sum++
                            if (sum == 10) {
                                core.info(`Try add reviewers for pull ${pr.number} and issue ${num} ten times... skip`);
                                break;
                            }
                        }
                        //编写message
                        let mess = `This PR ${pr.number} needs to be well documented and its associated issue is ${num} `


                        //企业微信通知
                        sum = 0;
                        while (await notice_WeCom(`markdown`, mess) != 200) {
                            sum++;
                            if (sum == 10) {
                                core.info(`Try to notice by WeCom for pull ${pr.number} and issue ${num} ten times... skip`);
                                break;
                            }
                        }
                        flag = true;
                        break;
                    }
                }
                if (flag) {
                    break;
                }
            }
        }

        if (prs.length < per_page) {
            core.info(`All pull request is checking, this job finished`);
            break;
        }
        page++;
    }
}

async function getPRs(page, per_page) {
    let { data: pr, status: status } = await oc.rest.pulls.list({
        ...repo,
        state: `open`,
        per_page: per_page,
        page: page
    })
    if (status != 200) {
        return null
    }
    return pr
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
            core.info(`Notice message: ${message}`);
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
    // let resp = await axios.post(uri_hook, JSON.stringify(notice_payload), {
    //     Headers: {
    //         'Content-Type': 'application/json'
    //     }
    // });
    // return resp.status;
    return 200
}

//reviewers是一个数组
async function addReviewers(number, reviewers) {
    if (reviewers.length == 0) {
        return true
    }
    let str_reviewers = JSON.stringify({ reviewers: reviewers })
    core.info(`Add reviewers ${reviewers} to pull request ${number}`);
    // let { status: status } = await oc.rest.pulls.requestReviewers({
    //     ...github.context.repo,
    //     pull_number: number,
    //     reviewers: str_reviewers
    // });
    // if (status != 201) {
    //     return false;
    // }
    return true;
}

function getReleatedIssueNumber(body) {
    const reg = /#(\d+)/igm
    const result = body.match(reg);
    if (result === null) {
        return [];
    }
    let ans = new Set();
    for (let i = 0; i < result.length; i++) {
        const e = result[i];
        ans.add(e.substring(1))
    }
    return Array.from(ans)
}

async function getIssueDetails(number) {
    let { data: issue, status: status } = await oc.rest.issues.get({
        ...repo,
        issue_number: number
    });
    return { data: issue, status: status };
}

async function reviewersHasCheck(number) {
    let { data: requested_reviewers, status: status } = await oc.rest.pulls.listRequestedReviewers({
        ...repo,
        pull_number: number
    });

    let all = await getApproveReviewers(number);
    let arr = new Array();
    for (let i = 0; i < requested_reviewers.users.length; i++) {
        all.add(requested_reviewers.users[i].login);
    }
    let arr_all = Array.from(all);
    for (let i = 0; i < arr_reviewers.length; i++) {
        const reviewer = arr_reviewers[i];
        for (let j = 0; j < arr_all.length; j++) {
            const user = arr_all[j];
            if (user == reviewer) {
                break;
            }
            if (j + 1 == arr_all.length) {
                arr.push(reviewer);
            }
        }
    }
    core.info(`All reviewers is: ` + arr_all);
    return arr
}

async function getApproveReviewers(number) {
    let { data: users } = await oc.rest.pulls.listReviews({
        ...repo,
        pull_number: number
    });

    let se = new Set();
    for (let i = 0; i < users.length; i++) {
        const user = users[i].user;
        se.add(user.login);
    }
    return se;
}

run();