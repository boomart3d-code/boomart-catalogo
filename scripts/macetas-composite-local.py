"""Local background replacement authorized by Adrian on 2026-11-02.
Product RGB comes from original photo; only alpha, scale and placement change.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
from rembg import new_session, remove
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[1]
PLATE_SOURCE = ROOT / 'source-art/macetas/fondo-botanico-v1.png'
ART = ROOT / 'source-art/macetas'
MASKS = ART / 'masks'
MASKS.mkdir(parents=True, exist_ok=True)
plate = Image.open(PLATE_SOURCE).convert('RGB').resize((1200,1500), Image.Resampling.LANCZOS)
plate.save(ART / 'fondo-botanico-v1.jpg', quality=94)
manifest = json.loads((ROOT/'docs/macetas-botanica-inventario.json').read_text(encoding='utf-8'))
opts=ort.SessionOptions()
opts.intra_op_num_threads=4
opts.inter_op_num_threads=1
session=None
result=[]
for job in manifest['jobs']:
    if job.get('generated') and not job.get('mask'):
        continue
    source=ROOT/job['source']
    original=Image.open(source).convert('RGB')
    mask_path=MASKS/(job['id']+'-'+str(job['index'])+'.png')
    if mask_path.exists():
        alpha=Image.open(mask_path).convert('L')
    else:
        if session is None:
            session=new_session('birefnet-general', sess_opts=opts)
        alpha=remove(original, session=session, only_mask=True)
        alpha.save(mask_path)
    if job['id']=='maceta-pikachu' and job['index']==2:
        alpha=alpha.filter(ImageFilter.MinFilter(3))
    subject=original.convert('RGBA')
    subject.putalpha(alpha)
    bbox=alpha.getbbox()
    assert bbox
    subject=subject.crop(bbox)
    maximum=(1020,1200) if job['index']==1 else (1060,1250)
    scale=min(maximum[0]/subject.width,maximum[1]/subject.height)
    subject=subject.resize((round(subject.width*scale),round(subject.height*scale)),Image.Resampling.LANCZOS)
    x=(1200-subject.width)//2
    baseline=1370
    y=baseline-subject.height
    canvas=plate.convert('RGBA')
    shadow=Image.new('RGBA',canvas.size,(0,0,0,0))
    d=ImageDraw.Draw(shadow)
    spread=subject.width*.36
    d.ellipse((600-spread,baseline-20,600+spread,baseline+24),fill=(47,36,22,65))
    shadow=shadow.filter(ImageFilter.GaussianBlur(22))
    canvas=Image.alpha_composite(canvas,shadow)
    canvas.alpha_composite(subject,(x,y))
    target=ROOT/job['target']
    canvas.convert('RGB').save(target,quality=94)
    canvas.convert('RGB').save(target.with_suffix('.webp'),quality=84,method=6)
    result.append({**job,'generated':str(target),'mask':str(mask_path.relative_to(ROOT)).replace('\\','/'),'method':'local pixel-preserving cutout/composite; approved by owner','status':'awaiting visual inspection','sourceBBox':list(bbox)})
    print(json.dumps({'id':job['id'],'index':job['index'],'bbox':bbox,'size':subject.size}),flush=True)
(ROOT/'source-art/macetas/local-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
