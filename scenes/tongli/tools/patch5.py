import io
p = 'tongli/tools/check.mjs'
s = io.open(p, encoding='utf-8').read()

old_exc = "logs.push(`EXCEPTION ${d.exception?.description || d.text}\\n    @ ${d.url || ''}:${d.lineNumber || 0}`);"
new_exc = """const st = (d.stack && d.stack.stackTrace ? d.stack.stackTrace : []).slice(0, 8)
      .map((f) => `    at ${f.functionName || '(anon)'} ${String(f.url || d.url || '').split('/').slice(-1)[0]}:${f.lineNumber ?? d.lineNumber ?? 0}`).join('\\n');
    logs.push(`EXCEPTION ${d.exception?.description || d.text}\\n${st}\\n    @ ${d.url || ''}:${d.lineNumber || 0}`);"""
assert old_exc in s, 'exc line not found'
s = s.replace(old_exc, new_exc)
s = s.replace(".join(' ').slice(0, 400)", ".join(' ').slice(0, 1600)")
s = s.replace("String(m.params.entry.text).slice(0, 300)", "String(m.params.entry.text).slice(0, 900)")
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('check.mjs patched')
