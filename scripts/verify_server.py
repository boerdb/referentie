import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.1.32", username="root", password="kerkpoort", timeout=20)
for cmd in [
    "pm2 show referentie | head -20",
    "curl -s -o /dev/null -w 'login %{http_code}\\n' http://127.0.0.1:3023/login",
    "curl -s http://127.0.0.1:3023/api/health/redis",
]:
    _, o, e = c.exec_command(cmd)
    print(o.read().decode())
    err = e.read().decode()
    if err.strip():
        print(err)
c.close()
