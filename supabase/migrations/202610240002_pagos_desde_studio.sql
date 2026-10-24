-- Lectura del nexo real pedido web -> Studio. No crea abonos ni confirmaciones Meta.
create or replace function public.panel_pagos_desde_studio(p_submissions uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
  if coalesce(array_length(p_submissions,1),0)>250 then
    raise exception 'Demasiados registros' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.creado_en desc),'[]'::jsonb)
  into resultado from (
    select c.submission_id,p.codigo,p.estado as estado_pedido,p.creado_en,
      p.studio_nv as nv_asignada,v.nv,v.total,v.abonado,v.saldo,v.estado as estado_studio,
      v.estado_pago,v.medio_pago,v.sincronizado_en,
      case when p.estado='descartado' then 'descartado'
        when coalesce(v.contradictorio,false) or coalesce(v.coincidencias,0)>1 or (p.studio_nv<>'' and v.nv<>p.studio_nv) then 'ambiguo'
        when v.nv is null and p.studio_nv<>'' then 'sincronizando'
        when v.nv is null then 'sin_validar'
        when v.total<=0 or v.abonado<0 or v.saldo<0 or v.abonado>v.total
          or abs(v.total-v.abonado-v.saldo)>0.01 or v.estado ~* 'anulad|cancelad' then 'revisar'
        when v.abonado<=0 then 'sin_abono'
        when v.saldo>0 then 'abono_parcial'
        else 'pagado' end as pago
    from public.clientes_web c
    cross join lateral (select w.* from public.pedidos_web w where w.cliente_id=c.id
      order by w.creado_en desc limit 20) p
    left join lateral (
      select count(*)::int coincidencias,
        bool_or((s.pedido_web<>'' and s.pedido_web<>p.codigo) or exists (
          select 1 from public.pedidos_web otro where otro.studio_nv=s.nv and otro.codigo<>p.codigo
        )) contradictorio,
        case when count(*)=1 then min(s.nv) end nv,
        case when count(*)=1 then min(s.total) end total,
        case when count(*)=1 then min(s.abonado) end abonado,
        case when count(*)=1 then min(s.saldo) end saldo,
        case when count(*)=1 then min(s.estado) end estado,
        case when count(*)=1 then min(s.estado_pago) end estado_pago,
        case when count(*)=1 then min(s.medio_pago) end medio_pago,
        case when count(*)=1 then max(s.sincronizado_en) end sincronizado_en
      from public.ventas_studio s where not s.eliminada
      and (s.pedido_web=p.codigo or (p.studio_nv<>'' and s.nv=p.studio_nv))
      -- Se conservan también los extremos contradictorios para detectarlos.
    ) v on true
    where c.submission_id=any(p_submissions)
  ) x;
  return resultado;
end;
$$;
revoke all on function public.panel_pagos_desde_studio(uuid[]) from public,anon;
grant execute on function public.panel_pagos_desde_studio(uuid[]) to authenticated;
