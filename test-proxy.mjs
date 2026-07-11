import { HttpsProxyAgent } from 'https-proxy-agent';

const url = 'https://yuanzhi-yw.github.io/agent-architecture-map/';
const agent = new HttpsProxyAgent('http://127.0.0.1:7890');

console.log('Agent created:', agent.constructor.name);

try {
  const response = await fetch(url, {
    dispatcher: agent,
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });
  console.log('Status:', response.status);
  console.log('OK:', response.ok);
} catch (error) {
  console.error('Error:', error.message);
  console.error('Error cause:', error.cause);
}
