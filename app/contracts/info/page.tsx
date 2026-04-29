import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Información — Analizador de contratos HCV",
};

export default function ContractsInfoPage() {
  return (
    <div className="space-y-8 pb-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
          Información
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Qué hace esta herramienta, con qué criterios trabaja y qué límites tiene.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Funcionalidades</h2>
        <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1.5 leading-relaxed">
          <li>
            Subida <strong>masiva de fotos</strong> de albaranes (formularios
            Glomark Home manuscritos) en almacenamiento privado en la nube.
          </li>
          <li>
            <strong>Extracción automática de datos</strong> desde cada imagen:
            nombre, NIF, albarán, importes, IBAN, texto de artículos, etc., según
            el formato del modelo.
          </li>
          <li>
            <strong>Detección de posibles duplicados</strong> contra contratos ya
            archivados, para revisión humana cuando haga falta.
          </li>
          <li>
            Listado de contratos, pestaña <strong>Por revisar</strong>,
            gestión por <strong>lotes</strong> y actualización según estado de los
            trabajos.
          </li>
          <li>
            <strong>Huella SHA-256</strong> opcional sobre el fichero binario para
            avisar si estás volviendo a subir exactamente el mismo archivo (con opción de
            forzar la resubida).
          </li>
          <li>
            Borrado de contratos o lotes, eliminando las fotos vía{" "}
            <strong>API de Storage</strong> desde el servidor (no mediante SQL sobre
            tablas internas de almacenamiento).
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Qué hace y cómo (flujo)
        </h2>
        <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-2 leading-relaxed">
          <li>
            Con sesión iniciada, seleccionás fotos por lote; cada foto crea una fila{" "}
            <strong>job</strong> en cola.
          </li>
          <li>
            Una <strong>Edge Function</strong> en Supabase (Deno), invocada de forma
            periódica, reclama trabajos, descarga la imagen del bucket y envía la imagen al
            servicio de <strong>Anthropic (Claude)</strong> en modo mensaje con imagen más
            instrucciones fijas para obtener un único objeto JSON por albarán.
          </li>
          <li>
            Se guarda una fila de <strong>contrato</strong> con esos campos,
            huella opcional del fichero cuando exista en el job y el resultado de una
            comprobación de duplicidad en base de datos. Si no hay problema claro ni
            confianza baja por el umbral, el contrato queda archivado automáticamente;
            si no, pasa a <strong>Por revisar</strong>.
          </li>
          <li>
            En revisión una persona corrige valores, guarda, marca duplicidad o borra según el
            criterio interno.
          </li>
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Criterios que sigue la aplicación
        </h2>
        <dl className="text-sm text-slate-700 space-y-3 leading-relaxed">
          <div>
            <dt className="font-medium text-slate-800">
              Posibles duplicados (base de datos)
            </dt>
            <dd className="mt-1">
              Se marca coincidencia con contratos ya guardados si vale{" "}
              <strong>cualquiera</strong> de estos criterios: mismo{" "}
              <strong>NIF y misma fecha de promoción</strong>; o mismo{" "}
              <strong>número de albarán</strong>, tal como están guardados tras
              normalizar donde aplica. No hay prioridad “primero uno y luego otro”: con
              que se cumpla una relación, entra en la búsqueda de duplicados.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-800">Revisión obligatoria</dt>
            <dd className="mt-1">
              Un contrato pasa a <strong>Por revisar</strong> si hay coincidencias de
              duplicado <strong>o</strong> la confianza global que devuelve el modelo en el
              JSON está por debajo del umbral configurado (en el código, por debajo del
              70%).
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-800">Misma foto otra vez</dt>
            <dd className="mt-1">
              La coincidencia por huella es por <strong>bytes idénticos</strong>. Si
              reexportás la imagen (p. ej. WhatsApp), el hash suele cambiar y no se
              considera el mismo fichero.</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Posibles errores y limitaciones
        </h2>
        <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1.5 leading-relaxed">
          <li>
            <strong>Lectura dudosa de la foto</strong>: tinta borrosa, sombras,
            foto movida o errores típicos al leer manuscritos. El modelo intenta devolver{" "}
            <code>null</code> donde no ve claro según las reglas del prompt; igual puede
            equivocarse o quedar valores en zona gris.
          </li>
          <li>
            <strong>Duplicados “de negocio”</strong>: dos ventas reales pueden compartir
            NIF y fecha sin ser el mismo papel; puede no detectarse como duplicado si el OCR
            lee distinto algún dígito; o sí detectarse sin ser el mismo caso.
          </li>
          <li>
            Alto volumen en cola: cada invocación del procesador reclama un número acotado de
            jobs; con muchas fotos el total tarda más en completarse.
          </li>
          <li>
            Borrados o subidas que fallen por red o permisos: puede quedar limpieza manual
            desde el panel de Supabase.
          </li>
          <li>
            Configuración de entorno incompleta (URLs, claves): fallos de sesión o de API.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          IA que analiza las imágenes
        </h2>
        <p className="text-sm text-slate-700 leading-relaxed">
          Este proyecto usa <strong>Anthropic Claude Sonnet 4.6</strong>: por su equilibrio
          entre capacidad multimodal en español, legibilidad de manuscritos y costes
          tratables sobre API, es el modelo de IA <strong>más avanzado</strong> elegido aquí para
          esta <strong>tarea concreta de extracción de datos</strong> desde las fotos de
          albarán. No es un OCR clásico aislado: interpreta la hoja como un lector humano y
          devuelve un JSON con campo <code>confidence</code> (0 a 1) y notas cuando tenga reservas.
        </p>
        <p className="text-sm text-slate-700 leading-relaxed mt-3 border-l-2 border-amber-200 pl-3">
          Igualmente tiene <strong>errores y limitaciones inevitables</strong>: fotos truncas,
          solapamiento de texto, ambigüedad en cifras o en el papel arrugado pueden dar lecturas
          incorrectas parciales; la confianza que declara es orientativa y la revisión humana sigue siendo necesaria cuando el negocio lo exija.
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 mt-4 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Coste por extracción (facturación Anthropic / Claude API)
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            Según las{" "}
            <a
              href="https://platform.claude.com/docs/en/about-claude/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-900 underline underline-offset-2 hover:no-underline"
            >
              tarifas públicas actuales
            </a>{" "}
            de Claude para la API estándar (no incluyen impuestos ni descuentos opcionales como
            Batch o caché), <strong>Claude Sonnet 4.6</strong> factura aproximadamente:
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>
              <strong>Entrada:</strong> ~3 USD por cada millón de tokens de entrada (
              <code>prompt</code> del sistema, la imagen convertida a tokens y el texto corto que
              envía el job).
            </li>
            <li>
              <strong>Salida:</strong> ~15 USD por cada millón de tokens de la respuesta (en este
              proyecto el JSON tiene un tope de <code>max_tokens: 2000</code> por petición; el
              consumo real suele ser menor).
            </li>
          </ul>
          <p className="text-sm text-slate-700 leading-relaxed">
            Cada <strong>extracción ≈ una llamada por foto</strong>. El importe real lo fija el{" "}
            <strong>uso de tokens</strong> que devuelve la API (<code>usage</code> en la
            respuesta): la imagen + el prompt de sistema suman la entrada; el JSON la salida. Si
            la resolución o el tamaño de la foto suben mucho, suben también los tokens de entrada.
          </p>

          <div className="mt-3 rounded-lg bg-white border border-slate-200/80 px-3 py-3 space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Ejemplo numérico (supuesto realista por contrato)
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              Como referencia de orden práctico: <strong>~1.500 tokens de entrada</strong>{" "}
              (imagen típica + prompt del sistema) y <strong>~500 tokens de salida</strong>{" "}
              (JSON de campos), con Sonnet 4.6 a los precios citados más arriba.
            </p>
            <ul className="text-sm text-slate-800 font-mono leading-relaxed space-y-1.5 pl-0 list-none border-l-2 border-slate-300 pl-3">
              <li>
                1 contrato → entrada (1 500 × 10⁻⁶ M × $3) + salida (500 × 10⁻⁶ M × $15) ≈{" "}
                <strong className="font-sans">
                  $0,0045 + $0,0075 = ~$0,012 USD
                </strong>{" "}
                <span className="text-slate-600 font-sans text-xs">
                  (unos ~0,01 € según paridad; sin IVA).
                </span>
              </li>
              <li>
                <strong>1.000 contratos</strong> → 1,5 M tokens in × ($3/M) = <strong>$4,50</strong>;
                0,5 M tokens out × ($15/M) = <strong>$7,50</strong> → total API ≈ <strong>$12</strong>.
                Tipo de cambio típico: <strong>~11 €</strong> solo lo facturado por tokens (sin
                impuestos locales).
              </li>
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 mt-3">
            <div className="rounded-lg bg-white border border-slate-200/80 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Misma proporción lineal (mismo supuesto ×N)
              </p>
              <ul className="text-sm text-slate-800 mt-1.5 space-y-1 leading-snug">
                <li>
                  ~500 contratos → <strong>~6 €</strong> (~6 USD de API al mismo orden)
                </li>
                <li>
                  ~1.000 contratos → <strong>~11–12 €</strong> de API (~12 USD); como cifra de
                  trabajo suele bastar <strong>~12–13 €</strong> antes de IVA (redondeos y tipo).
                </li>
                <li>
                  ~5.000/mes → <strong>~60 €</strong> · ~10.000/mes → <strong>~120 €</strong> (API,
                  mismo supuesto de tokens por unidad).
                </li>
              </ul>
            </div>
            <div className="rounded-lg bg-white border border-slate-200/80 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Reintentos · IVA
              </p>
              <p className="text-sm text-slate-700 mt-1 leading-snug">
                Cada job puede pasar por <strong>hasta tres intentos</strong> en cola antes de
                quedar en error; cada ejecución que vuelve a llamar a Claude suma otro{" "}
                <code>usage</code>. Si hubiera muchísimos fallos seguidos, el coste se acerca a un
                multiplicador (&gt;1); con una subida estable y sin errores de integración suelen ser
                pocos los reintentos.
              </p>
              <p className="text-sm text-slate-700 mt-2 leading-snug">
                Si aplicas <strong>IVA</strong> (por ejemplo 21 % sobre tu factura con el proveedor),
                ~11 € de base orientativa API → orden de <strong>~13 €</strong> con IVA (solo
                referencia fiscal; tu caso concreto es distinto).
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Solo referencia; el dato fiable es el <code>usage</code> y la factura de Anthropic. No
            es presupuesto contractual.
          </p>
          <p className="text-xs text-slate-500">
            Quien paga la API es quien tenga la clave configurada en Supabase; el coste no lo cobra
            esta pantalla, solo el proveedor según su facturación mensual.
          </p>
        </div>

        <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1.5 mt-3 leading-relaxed">
          <li>
            Dependéis del servicio Anthropic (disponibilidad, cambios en modelos, precios,
            límites de cuenta) y de tener la clave correcta donde se ejecuta la Edge
            Function.
          </li>
          <li>
            El nivel de seguridad declarado (<code>confidence</code>) es una{" "}
            <strong>autoevaluación</strong> del modelo sobre esa imagen (recorte, compresión,
            etc.), no una medición externa auditada.
          </li>
          <li>
            No sustituye criterios legales, laborales ni contables: solo automatiza datos leídos
            de la foto en este flujo.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Lenguaje y tecnologías
        </h2>
        <p className="text-sm text-slate-700 leading-relaxed">
          El código de la aplicación web está escrito en <strong>TypeScript</strong> con el
          framework <strong>Next.js</strong> (App Router), estilos con{" "}
          <strong>Tailwind CSS</strong> y despliegue típico en <strong>Vercel</strong>. El
          backend de datos y autenticación es <strong>Supabase</strong>: base{" "}
          <strong>PostgreSQL</strong>, <strong>Auth</strong> por email,{" "}
          <strong>Storage</strong> para las imágenes, <strong>Edge Functions</strong> (Deno)
          para el procesador de jobs, y cron o mecanismos equivalentes para disparar el
          trabajo en cola. Las rutas de API en Node eliminan archivos de Storage con el
          cliente oficial, no con SQL directo sobre tablas internas.
        </p>
      </section>

      <footer className="pt-8 mt-4 border-t border-slate-200 text-center text-sm text-slate-500">
        <p className="font-medium text-slate-700">Hugo Campos Vázquez</p>
        <p className="mt-1">Autor / Responsable del proyecto</p>
      </footer>
    </div>
  );
}
