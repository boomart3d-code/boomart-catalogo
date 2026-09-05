Coloca aqui las imagenes reales de los codigos QR para activar el pago del adelanto:

  yape-qr.jpg   -> QR de tu cuenta Yape
  plin-qr.jpg   -> QR de tu cuenta Plin

Nombres de archivo sugeridos (puedes usar otros, ver siguiente paso).

Despues de agregar cada imagen, edita src/checkout-config.js:

  paymentMethods: {
    yape: {
      label: "Yape",
      holder: "NOMBRE DEL TITULAR",       <- completa esto
      qrImage: "assets/payments/yape-qr.jpg",
      available: true                     <- cambia a true
    },
    plin: {
      label: "Plin",
      holder: "NOMBRE DEL TITULAR",
      qrImage: "assets/payments/plin-qr.jpg",
      available: true
    }
  }

Mientras "available" siga en false, la web muestra ese metodo como
"No disponible" en vez de inventar un QR o un titular.
