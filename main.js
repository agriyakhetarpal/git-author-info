const defaultTitle = "Git Author Info";
const usernameInput = document.querySelector(".username-input");
const getButton = document.querySelector(".get-button");
const workingStatusText = document.querySelector(".working-status-text");
const resultText = document.querySelector(".result-text");

// GitHub usernames: alphanumeric and hyphens, no leading hyphen, max 39 chars, allow trailing hyphens.
// https://github.com/shinnn/github-username-regex/blob/0794566cc10e8c5a0e562823f8f8e99fa044e5f4/index.js#L1C16-L1C58
// https://github.com/shinnn/github-username-regex/pull/5
const validUsernameRegex = /^[a-z\d](?:[a-z\d]|-(?!-)){0,38}$/i;

let working;

const GITHUB_API = "https://api.github.com";

const CACHE_TTL_SECONDS = 3600;

if (typeof window !== "undefined" && window.ls) {
  window.ls.config.ttl = CACHE_TTL_SECONDS;
}

/**
 * Get the cached data for a key.
 * @param {string} key - Cache key
 * @returns {*} - Cached value, or null if not found/expired
 */
function getCached(key) {
  try {
    if (!window.ls) return null;
    return window.ls.get(key);
  } catch (err) {
    console.error("Cache read error:", err);
    return null;
  }
}

/**
 * Set cached data with TTL.
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 */
function setCached(key, value) {
  try {
    if (!window.ls) return;
    window.ls.set(key, value, { ttl: CACHE_TTL_SECONDS });
  } catch (err) {
    console.error("Cache write error:", err);
  }
}

function sanitizeString(string) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };
  const reg = /[&<>"'/]/gi;
  return string.replace(reg, (match) => map[match]);
}

class HTTPError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HTTPError";
    this.status = code;
  }
}

async function getUserInfo(username) {

  const cacheKey = `github_user_${username}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`Using cached user info for ${username}`);
    return cached;
  }

  const response = await fetch(`${GITHUB_API}/users/${username}`);
  const data = await response.json();
  if (!response.ok) {
    console.error("HTTPError", response);
    throw new HTTPError(response.status, data.message || "Unknown error");
  }

  setCached(cacheKey, data);
  console.log(`Cached user info for ${username}`);

  return data;
}

/**
 * Get the email addresses associated with the user's commits. We employ two strategies:
 * 1. Check the user's public events for commit data.
 * 2. Check the user's repositories for commits authored by them.
 * @param {string} username - The GitHub username.
 * @returns {Promise<string[]>} - Array of unique email addresses (real ones, not noreply ones).
 */
async function getCommitEmail(username) {

  const cacheKey = `github_emails_${username}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`Using cached commit emails for ${username}`);
    return cached;
  }

  const emails = new Set();

  try {
    const response = await fetch(
      `${GITHUB_API}/users/${username}/events/public`
    );
    if (response.ok) {
      const events = await response.json();
      for (const event of events) {
        if (event.type === "PushEvent" && event.payload.commits) {
          for (const commit of event.payload.commits) {
            if (commit.author && commit.author.email) {
              const email = commit.author.email;
              if (!email.includes("noreply.github.com")) {
                emails.add(email);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch commit email from events:", err);
  }

  // Try non-forked repos first as they're more likely to have the user's own commits.
  // If no email is found, we will check the user's forked repos. We'll check up to ten
  // repos in total to avoid excessive API calls.
  try {
    const reposResponse = await fetch(
      `${GITHUB_API}/users/${username}/repos?sort=updated&per_page=30`
    );
    if (reposResponse.ok) {
      const repos = await reposResponse.json();
      const nonForkedRepos = repos.filter((repo) => !repo.fork);
      const reposToCheck = nonForkedRepos.length > 0 ? nonForkedRepos : repos;

      for (const repo of reposToCheck.slice(0, 10)) {
        try {
          const commitsResponse = await fetch(
            `${GITHUB_API}/repos/${repo.owner.login}/${repo.name}/commits?author=${username}&per_page=10`
          );

          if (!commitsResponse.ok) continue;

          const commits = await commitsResponse.json();

          for (const commitData of commits) {
            if (
              commitData.commit &&
              commitData.commit.author &&
              commitData.commit.author.email
            ) {
              const email = commitData.commit.author.email;
              if (!email.includes("noreply.github.com")) {
                emails.add(email);
              }
            }
          }
        } catch (err) {
          console.error(`Failed to fetch commits from ${repo.full_name}:`, err);
          continue;
        }
      }
    }
  } catch (err) {
    console.error("Failed to fetch repos:", err);
  }

  const emailsArray = Array.from(emails);

  setCached(cacheKey, emailsArray);
  console.log(`Cached commit emails for ${username}`);

  return emailsArray;
}

/**
 * Extract the username from a GitHub URL, or return the input as-is, if it's already one.
 * We can handle URLs like the following:
 * - https://github.com/username
 * - http://github.com/username
 * - github.com/username
 * - https://github.com/username/repo
 * @param {string} input - The user input (URL or username).
 * @returns {string} - The extracted username.
 */
function extractUsername(input) {
  const trimmedInput = input.trim();
  if (trimmedInput.includes("github.com")) {
    try {
      let url;
      if (
        trimmedInput.startsWith("http://") ||
        trimmedInput.startsWith("https://")
      ) {
        url = new URL(trimmedInput);
      } else {
        url = new URL("https://" + trimmedInput);
      }
      const pathSegments = url.pathname
        .split("/")
        .filter((segment) => segment.length > 0);
      if (pathSegments.length > 0) {
        return pathSegments[0];
      }
    } catch (err) {
      console.error("Failed to parse URL:", err);
    }
  }

  return trimmedInput;
}

function checkInputValidity() {
  const username = extractUsername(usernameInput.value);
  if (!validUsernameRegex.test(username)) {
    let msg;
    if (!usernameInput.value.length) {
      msg = "Please enter a GitHub username or URL";
    } else {
      msg = "Invalid username or URL";
    }
    usernameInput.setCustomValidity(msg);
    usernameInput.reportValidity();
    return false;
  }
  return true;
}

function setWorkingStatus() {
  working = true;
  let workingStep = 1;
  usernameInput.readOnly = true;
  getButton.disabled = true;
  function showWorkingDots() {
    if (working) {
      workingStatusText.textContent = `working${" .".repeat(workingStep)}`;
      if (workingStep === 3) {
        workingStep = 1;
      } else {
        workingStep++;
      }
      setTimeout(showWorkingDots, 150);
    }
  }
  showWorkingDots();
}

function setFinishedStatus(errored, details) {
  working = false;
  workingStatusText.textContent = errored ? "ERROR!!!" : "done!";
  if (errored) {
    workingStatusText.classList.add("error");
    resultText.classList.add("error");
  }
  resultText.innerHTML = details;
  usernameInput.readOnly = false;
  getButton.disabled = false;
}

function updateQueryParamsAndTitle(username) {
  const url = new URL(window.location.href);
  const searchParams = url.searchParams;
  searchParams.set("username", username);
  window.history.replaceState(null, null, url);
  document.title = username.concat(" | ", defaultTitle);
}

function removeQueryParamsAndTitle() {
  const url = new URL(window.location.href);
  const searchParams = url.searchParams;
  for (let key of Array.from(searchParams.keys())) {
    searchParams.delete(key);
  }
  window.history.replaceState(null, null, url);
  document.title = defaultTitle;
}

function resetOutputStatus() {
  workingStatusText.innerHTML = "";
  workingStatusText.classList.remove("error");
  resultText.innerHTML = "";
  resultText.classList.remove("error");
  removeQueryParamsAndTitle();
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = button.textContent;
    button.textContent = "Copied!";
    button.classList.add("copied");
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("copied");
    }, 1500);
  } catch (err) {
    console.error("Failed to copy to clipboard:", err);
  }
}

function createResultHTML(userData, commitEmails) {
  const name = userData.name || userData.login;
  // Our priority is: commit email > API email > noreply GitHub standard email

  const allEmails = new Set();

  if (commitEmails && commitEmails.length > 0) {
    commitEmails.forEach((email) => allEmails.add(email));
  }
  if (userData.email) {
    allEmails.add(userData.email);
  }
  if (allEmails.size === 0) {
    allEmails.add(`${userData.id}+${userData.login}@users.noreply.github.com`);
  }

  const emailsArray = Array.from(allEmails);
  const isNoreply =
    emailsArray.length === 1 && emailsArray[0].includes("noreply.github.com");
  const hasMultiple = emailsArray.length > 1;

  let html = `<div class="author-info">`;
  html += `<div class="author-info-line" data-copy="${sanitizeString(
    name
  )}"><strong>Name:</strong> ${sanitizeString(name)}</div>`;

  if (hasMultiple) {
    html += `<div style="margin-top: 8px;"><strong>Email${
      emailsArray.length > 1 ? "s" : ""
    }:</strong></div>`;
    emailsArray.forEach((email, index) => {
      html += `<div class="author-info-line" data-copy="${sanitizeString(
        email
      )}" style="margin-left: 10px;">• ${sanitizeString(email)}</div>`;
    });
  } else {
    html += `<div class="author-info-line" data-copy="${sanitizeString(
      emailsArray[0]
    )}"><strong>Email:</strong> ${sanitizeString(emailsArray[0])}</div>`;
  }

  html += `</div>`;

  if (isNoreply) {
    html += `<p class="noreply-note">No public email address was found from recent commits. Here's their GitHub noreply address.</p>`;
  } else if (commitEmails && commitEmails.length > 0) {
    html += `<p class="noreply-note">${
      hasMultiple
        ? "These email addresses were found"
        : "This email address was found"
    } from their recent commits.</p>`;
  }

  html += `<div class="copy-buttons-container">`;
  emailsArray.forEach((email, index) => {
    const buttonLabel = hasMultiple
      ? `Copy #${index + 1} in "Name &lt;email&gt;"; format`
      : `Copy as "Name &lt;email&gt;"`;
    html += `<button class="copy-button" data-name="${sanitizeString(
      name
    )}" data-email="${sanitizeString(email)}">${buttonLabel}</button>`;
  });
  html += `</div>`;

  return html;
}

async function onSubmit() {
  if (!checkInputValidity()) {
    return;
  }
  const username = extractUsername(usernameInput.value);
  resetOutputStatus();
  setWorkingStatus();
  let resultString;
  try {
    const [userData, commitEmail] = await Promise.all([
      getUserInfo(username),
      getCommitEmail(username),
    ]);
    resultString = createResultHTML(userData, commitEmail);
    setFinishedStatus(false, resultString);
    updateQueryParamsAndTitle(username);

    // Add click handlers for all copy buttons
    document.querySelectorAll(".copy-button").forEach((button) => {
      button.addEventListener("click", () => {
        const name = button.dataset.name;
        const email = button.dataset.email;
        copyToClipboard(`${name} <${email}>`, button);
      });
    });

    document.querySelectorAll(".author-info-line").forEach((line) => {
      line.addEventListener("click", () => {
        const text = line.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          const original = line.innerHTML;
          line.innerHTML += " <em>(copied!)</em>";
          setTimeout(() => {
            line.innerHTML = original;
          }, 1000);
        });
      });
    });
  } catch (err) {
    if (err.name === "HTTPError") {
      if (err.status === 404) {
        resultString =
          "That user does not exist. Please check the username and try again.";
      } else if (
        err.status === 403 &&
        err.message.toLowerCase().includes("api rate limit exceeded")
      ) {
        resultString =
          "API rate limit exceeded. Please wait and try again later.";
      } else {
        resultString = `unexpected error: ${sanitizeString(err.toString())}`;
      }
    } else {
      resultString = `unexpected error: ${sanitizeString(err.toString())}`;
    }
    setFinishedStatus(true, resultString);
  }
}

usernameInput.addEventListener("keydown", (event) => {
  usernameInput.setCustomValidity("");
  if (event.key === "Enter") {
    onSubmit();
  }
});
getButton.addEventListener("click", onSubmit);

function maybeUseUsernameFromURL() {
  const params = new URLSearchParams(document.location.search.substring(1));
  let username = params.get("username");
  if (username === null) {
    return;
  }
  username = extractUsername(username);
  usernameInput.blur();
  const tipAdmonition = document.querySelector("#tip-admonition");
  if (tipAdmonition) {
    tipAdmonition.remove();
  }
  usernameInput.value = username;
  getButton.click();
}

window.addEventListener("DOMContentLoaded", maybeUseUsernameFromURL);
