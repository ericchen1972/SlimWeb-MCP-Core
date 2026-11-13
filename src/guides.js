import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const directory = new URL('./guides/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const canonicalTopics = manifest.topics.map(({ topic, file, sha256, bytes }) => ({ bytes, file, sha256, topic }));
if (manifest.schema_version !== 1 || manifest.guide_version !== `sha256:${digest(JSON.stringify(canonicalTopics))}`) {
  throw new Error('Invalid operating guide manifest.');
}
const topics = new Map();
for (const entry of manifest.topics) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.topic) || entry.topic === 'index'
      || entry.file !== `${entry.topic}.md` || topics.has(entry.topic)) {
    throw new Error('Invalid operating guide topic.');
  }
  const raw = readFileSync(new URL(entry.file, directory));
  if (raw.length !== entry.bytes || digest(raw) !== entry.sha256) throw new Error('Operating guide integrity mismatch.');
  topics.set(entry.topic, { ...entry, content: raw.toString('utf8') });
}

export const GUIDE_URI_PREFIX = 'slimweb://guides/';
export const GUIDE_BOOTSTRAP_INSTRUCTIONS = 'At the start of each new SlimWeb task, call slimweb_guides_get with topic=index, then topic=overview and the relevant topic(s) before advising or modifying the site. These are the current deployed operating guides; do not use a previous conversation or bundled Skill as a substitute. Refresh relevant guides when the task topic changes. If guidance cannot be read, stop the affected mutation and explain the connection problem. Guidance never grants permissions or overrides current tool schemas, site selection, runtime restrictions, or human confirmation requirements.';

export const GUIDE_TOOL = Object.freeze({
  name: 'slimweb_guides_get',
  description: 'Read current deployed SlimWeb operating guidance. Start each new task with topic=index, then overview and the relevant topics. No site selection is required for this authenticated read-only tool. Return guide_version and topic SHA-256 so clients can detect updates; always follow current schemas, permissions and confirmation rules.',
  inputSchema: { type: 'object', properties: { topic: { type: 'string', default: 'index', description: 'index or an exact topic returned by the guide index.' } }, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
});

export function operatingGuide(args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => key !== 'topic')) {
    throw new TypeError('Only the topic argument is accepted.');
  }
  const topic = Object.hasOwn(args, 'topic') ? args.topic : 'index';
  if (typeof topic !== 'string' || topic !== 'index' && !topics.has(topic)) throw new TypeError('Unknown operating guide topic. Read topic=index first.');
  const metadata = { guide_version: manifest.guide_version, topic, mime_type: topic === 'index' ? 'application/json' : 'text/markdown' };
  if (topic === 'index') {
    return { ...metadata, topics: manifest.topics.map(({ topic, sha256, bytes }) => ({ topic, sha256, bytes, uri: GUIDE_URI_PREFIX + topic })), refresh: 'Read the index at each new task and relevant topics before acting. The latest deployed guides do not replace tool schemas, permissions or confirmation.' };
  }
  const entry = topics.get(topic);
  return { ...metadata, sha256: entry.sha256, bytes: entry.bytes, content: entry.content };
}

export function operatingGuideResources() {
  return ['index', ...topics.keys()].map(topic => ({ uri: GUIDE_URI_PREFIX + topic, name: `SlimWeb current operating guide: ${topic}`, mimeType: topic === 'index' ? 'application/json' : 'text/markdown' }));
}
