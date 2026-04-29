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
