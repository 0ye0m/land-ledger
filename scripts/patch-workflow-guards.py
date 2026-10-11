#!/usr/bin/env python3
"""Insert null-guards after every guarded findOneAndUpdate decision block in
workflowController.js so a lost concurrent race returns 409 instead of 200
with property:null + phantom stage history / audit events."""
import sys

PATH = '/home/z/my-project/land-ledger/backend/src/controllers/workflowController.js'
GUARD = (
    "if (!updated) return fail(res, { message: "
    "'This record changed while you were reviewing it - the action was not applied. Refresh and try again.', "
    "errorCode: 'INVALID_STATE', status: 409 });\n"
)

def main() -> None:
    with open(PATH) as f:
        lines = f.readlines()
    out, patched = [], 0
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        if 'const updated = await' in line and (
            'Property.findOneAndUpdate' in line or 'TransferRequest.findOneAndUpdate' in line
        ):
            # find the statement terminator (line ending in .lean();)
            j = i
            while j < len(lines) and not lines[j].rstrip().endswith('.lean();'):
                j += 1
            if j < len(lines):
                # copy statement lines
                for k in range(i + 1, j + 1):
                    out.append(lines[k])
                # next non-empty line must not already be a null check
                nxt = lines[j + 1].strip() if j + 1 < len(lines) else ''
                if not nxt.startswith('if (!updated)'):
                    indent = '  '
                    out.append(indent + GUARD)
                    patched += 1
                i = j
        i += 1
    with open(PATH, 'w') as f:
        f.writelines(out)
    print(f"patched {patched} guarded-update block(s) in {PATH.split('/')[-1]}")
    if patched == 0:
        sys.exit("ERROR: no blocks patched - pattern drifted, inspect manually")

if __name__ == '__main__':
    main()
