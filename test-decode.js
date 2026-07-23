const b64 = 'CBMixAFBVV95cUxQWVpTT29WejB1REZsTjhDVElIOUxoSW9KMFNlWENmTXRfS1lRdE1KMDdRay1aU3VMUjhIZlhLdlcya0xIbXFueFQ4d0RKVVQzSEhfYmVhWUJHelo4eWk2SS1UNHJNYVRLLWNjR2dUamkzcVRMUElLWXgtT0o0SUN1eTQ4LWZPbEtXbE1rMzlrNXJmTF9vY2Jyd1BXODVzRERMTVQ0d3NJZkNTcjhXei1MRnJCSmlyS2RsZjZ5OWE3QnR0TWs30gHMAUFVX3lxTE13c1E4b0o1d0pGLXdGM3RUV3NwWWFoY2xhbEhYejRtNkNTOG00dG1xTWRTWGpTNDlNTHJrSXdnY0RVaEZxdEZYUC1FbkdtOTBlTjNIeVlsUWtEanNCcUtzbE9BSlI4NGNPQVBVQkxVY3M3dUZBbldHcE1TWDN1SE8ySkxwc0pvZ1dfNWJYd0I3cDV4cXpEYzhaWFZLdGJDakJCWWpPbkpLSDBjY3JheFNLZVhEZGJuUkVaLTQwTl9ZelNIRWpLWUNMUWQ3cA';
const decoded = Buffer.from(b64, 'base64').toString('ascii');
console.log("Decoded string:");
console.log(decoded);
const match = decoded.match(/https?:\/\/[^\s\"\'\>]+/g);
console.log("Matches:", match);
