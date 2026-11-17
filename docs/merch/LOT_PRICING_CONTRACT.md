# Contrato de precio por lote — propuesta

Relacionado: issue #31 y propuesta ADR 0003 (#20).

## Problema
El motor de checkout existente utiliza precio de variante × cantidad y reserva stock físico.
BASSSE Merch vende mayoritariamente **lotes de fabricación bajo pedido** con múltiples
técnicas, cantidad mínima y presupuesto. Un lote de 100 no son 100 artículos físicos
reservables en inventario: se trata de una propuesta comercial de fabricación.

## Contrato
La variante comercial contiene `unitsPerLot`, `netLotCents`, `grossLotCents`,
`currency`, `catalogStatus`, `purchaseMode` y cuatro verificaciones: coste proveedor,
fiscalidad para destino, portes para destino y capacidad de producción.

El comprador elige **número de lotes**, nunca unidades sueltas fuera de la tarifa.
Un precio del PDF se conserva como valor del lote completo; el precio unitario que
aparezca en la interfaz es informativo y no debe usarse para redondear el total.

- En modo `draft`, `archived`, `quote_only` o sin verificaciones: **no se permite checkout**.
- Los costes de transporte son por pedido y deben estar determinados, incluso cuando sean 0.
- El importe bruto y el tipo fiscal solo pueden considerarse aprobados tras verificar
  destino, tipo de cliente, jurisdicción y criterios de facturación.
- `reviewMerchLot` devuelve una vista informativa sin importe pagable cuando hay bloqueos.
- `assertMerchLotReady` lanza un error si falta cualquier verificación.

## Límite de esta PR
La librería es **pura** y se prueba de forma unitaria. **Todavía no se usa desde
`POST /checkout`**, ni altera tablas, Stripe, inventario o base de datos.
No activar venta directa de catálogo hasta conectar este contrato al back-end,
autorización y modelo de capacidad de fabricación, todo con tests de integración.

## Pendientes para la siguiente ADR
Capacidad por proveedor/fecha de producción vs stock físico; dirección de envío,
impuestos según destino, pago contra presupuesto aceptado, versiones de arte
y aprobación registrada del cliente. Requiere validación comercial del propietario.
