const base64String = "eyJkZWNpc2lvbl9pZCI6IjhhZDE4NmU2LTFhODEtNDkyOS04ZjNhLTdmY2ViN2QyNGE1ZiIsImltcHJlc3Npb25faWQiOiI5ZWRkNDdmMC1lYTk0LTQxNmUtOGNlMi1mNTFkYTE0OWQ4NmYiLCJwcm92aWRlcl9pZCI6MTc2NjIwLCJmZWF0dXJlZF9saXN0aW5nX2lkIjoyMzksImZlYXR1cmVkX3Bvc2l0aW9uX2lkIjoyMzgyNjUsInBvc2l0aW9uIjoxLCJpc19zcG90bGlnaHQiOmZhbHNlfQ";
const buffer = Buffer.from(base64String, 'base64');
const decodedParams = JSON.parse(buffer.toString('utf-8'));

console.log('Decoded Payload:', JSON.stringify(decodedParams, null, 2));
