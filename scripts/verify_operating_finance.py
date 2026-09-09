"""Independent Decimal oracle over seeded synthetic monthly financial inputs."""
import json,random,subprocess,platform,sys
from decimal import Decimal
from pathlib import Path
root=Path(__file__).resolve().parents[1]
rng=random.Random(20260908)
cases=[[rng.randint(-100000000,100000000)/100 for _ in range(8)] for _ in range(200)]
cases[0]=[0,-100,0,0,0,0,0,0]
result=subprocess.run(['node',str(root/'workbench/scripts/operating-oracle-runner.mjs')],input=json.dumps(cases),text=True,capture_output=True,check=True)
for values,output in zip(cases,json.loads(result.stdout)):
 a=list(map(lambda v:Decimal(str(v)),values))
 expected=[a[3]-a[2],a[2]-Decimal(500000),100*a[1]/a[0] if a[0]>0 else None]
 for value,item in zip(expected,output['derived']):
  assert item['actual'] is None if value is None else abs(Decimal(str(item['actual']))-value)<Decimal('0.000001')
 for i,line in enumerate(output['lines']):assert abs(Decimal(str(line['delta']))-(a[i]-a[i+4]))<Decimal('0.000001')
report={'status':'VERIFIED_LOCAL_SYNTHETIC','cases':len(cases),'seed':20260908,'oracle':'Python Decimal independent arithmetic','python':sys.version.split()[0],'platform':platform.platform(),'checks':['actual/forecast differences','net debt','cash headroom','positive/zero/negative revenue','negative EBITDA margin'],'limitations':['not practitioner validation','no real investment performance','no annualized leverage or runway inferred']}
print(json.dumps(report,indent=2))
