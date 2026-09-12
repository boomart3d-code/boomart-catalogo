/*
 * Configuracion centralizada del flujo de carrito y pedido por WhatsApp.
 * Edita solo los valores de aqui abajo -- no hace falta tocar cart.js ni checkout.js.
 */
window.BOOMART_CHECKOUT = {
  // Numero de WhatsApp de atencion y recepcion de pedidos (formato: codigo de pais + numero, sin + ni espacios).
  whatsappNumber: "51925666542",

  // Porcentaje de adelanto sobre el total de productos (0.5 = 50%).
  advanceRate: 0.5,

  // Plazo de fabricacion en horas utiles, contado desde la validacion del adelanto.
  productionHours: 48,

  // Origen del taller (solo referencia general, no una direccion exacta de recojo).
  businessOrigin: "San José, Bellavista, Callao",

  // Metodos de pago del adelanto. Hay dos tipos:
  //  - type: "qr"      -> Yape/Plin: muestra el QR, boton de descarga, titular y
  //                       numero (con boton Copiar). Pon available:true cuando la
  //                       imagen del QR real este lista en assets/payments/.
  //  - type: "account" -> Interbank/BCP: muestra titular, numero de cuenta (con
  //                       boton Copiar) y, si completas "cci", tambien el CCI con
  //                       su propio boton Copiar. Deja cci: "" mientras no lo tengas
  //                       -- esa fila simplemente no se muestra.
  // El titular ("holder") sale siempre igual en las 4 opciones: cambialo aqui una
  // sola vez si hiciera falta. Mientras available sea false (o falte el numero),
  // la web muestra ese metodo como "No disponible" y no inventa datos.
  paymentMethods: {
    yape: {
      type: "qr",
      label: "Yape",
      holder: "Mónica Karina Molina Escalona",
      qrImage: "assets/payments/yape-qr.jpeg",
      phone: "928026092",
      available: true
    },
    plin: {
      type: "qr",
      label: "Plin",
      holder: "Mónica Karina Molina Escalona",
      qrImage: "assets/payments/plin-qr.jpeg",
      phone: "928026092",
      available: true
    },
    interbank: {
      type: "account",
      label: "Interbank",
      holder: "Mónica Karina Molina Escalona",
      accountNumber: "2893430503921",
      cci: "00328901343050392163",
      available: true
    },
    bcp: {
      type: "account",
      label: "BCP",
      holder: "Mónica Karina Molina Escalona",
      accountNumber: "19194306650040",
      cci: "00219119430665004056",
      available: true
    }
  },

  // Condiciones de entrega y cobro del saldo, mostradas antes del pago y usadas
  // tambien en el mensaje de WhatsApp. destinationKey: "lima" | "provincias".
  deliveryTerms: {
    lima: {
      label: "Lima y Callao",
      summary:
        "El envío se coordina por motorizado o agencia según tu distrito; el costo se coordina por WhatsApp y no está incluido en estos importes.",
      balanceCondition: "Pagarás el saldo de los productos cuando recibas tu pedido."
    },
    provincias: {
      label: "Provincias",
      summary:
        "El despacho se realiza por Shalom. Tras despachar, BoomArt te envía foto del comprobante de envío y de la caja rotulada; el costo del envío se coordina por WhatsApp y no está incluido en estos importes.",
      balanceCondition:
        "Pagarás el saldo de los productos y, tras validarlo, BoomArt te entregará el código de recojo en la agencia Shalom."
    }
  }
};
