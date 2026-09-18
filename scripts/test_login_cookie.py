import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.1.32", username="root", password="kerkpoort", timeout=20)

_, o, _ = c.exec_command(
    "ssh -o StrictHostKeyChecking=no root@192.168.1.14 "
    "\"mysql -ureferentie -pkerkpoort referentie -N -e 'SELECT email FROM users LIMIT 5'\""
)
emails = o.read().decode().strip()
print("users:", emails or "(none)")

_, o, _ = c.exec_command(
    """curl -s -D - -o /dev/null -X POST http://127.0.0.1:3023/api/auth/register \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"cookie-test@local.dev","password":"testpass1234","name":"Test"}' """
)
headers = o.read().decode()
for line in headers.splitlines():
    if line.lower().startswith(("http/", "set-cookie")):
        print(line)

c.close()
