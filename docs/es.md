# Índice UV

Esta integración sigue el **índice UV** de las ubicaciones que elija. Añade sus
**viviendas de Gladys con un clic**, o una ubicación por su **código postal
francés**, y aparece un dispositivo en la pestaña **Descubrir**, listo para
añadirlo a Gladys.

Ninguna cuenta que crear, ninguna clave de API que pegar: las dos fuentes son
datos abiertos públicos.

> Requiere **Gladys 5.3.0** o posterior.

## Añadir sus viviendas de Gladys, con un clic

Ya le ha dicho a Gladys dónde vive: es el mapa de **Configuración > Viviendas**.
El botón **«Añadir mis viviendas de Gladys»** lee esas viviendas y crea una
ubicación por cada una que aún no se vigila, sin código postal que escribir.

Tres cosas que conviene saber:

- **El acceso es un permiso.** El lugar donde vive es un dato personal: Gladys
  solo lo comparte si aceptó la solicitud en la pantalla de instalación de la
  integración. Si el botón responde que el acceso se ha denegado, elimine la
  integración y vuelva a instalarla, aceptando la solicitud que muestra.
- **Una vivienda que nunca situó en el mapa no tiene coordenadas.** Se nombra en
  la respuesta; ubíquela en Configuración > Viviendas y vuelva a ejecutar la
  acción.
- **No es una sincronización.** Las viviendas se leen en el momento en que pulsa.
  Lo que se obtiene es una ubicación normal, que se renombra y elimina como las
  demás, y una vivienda que se mueva después en Gladys no mueve su ubicación.

Para añadir solo una de sus viviendas —una casa de vacaciones que no quiere
vigilar se queda fuera—, elíjala en el campo **Vivienda** del botón (Gladys 5.2
o posterior); si lo deja vacío, se añaden todas las viviendas.

Volver a pulsar no tiene riesgo: una vivienda que ya se vigila se indica, no se
añade una segunda vez.

## Añadir una ubicación

En la pestaña **Configuración** de la integración, pulse **«Añadir una
ubicación»** y rellene el formulario:

- **Nombre de la ubicación**: opcional. Si lo deja vacío, se usa el nombre del
  municipio encontrado («Nantes»).
- **Código postal**: cinco cifras, por ejemplo `44300`. Es la forma habitual.
- **Municipio**: opcional, y solo es necesario cuando un código postal abarca
  varios municipios. `01000` corresponde a Bourg-en-Bresse, Péronnas _y_
  Saint-Denis-lès-Bourg: ejecute primero la acción sin este campo, la respuesta
  mostrada bajo el botón lista los candidatos, y vuelva a ejecutarla con el que
  busca.
- **Latitud / Longitud**: opcionales. Si se rellenan juntas, se usan tal cual y
  el código postal de arriba pasa a ser una simple etiqueta.

El mensaje bajo el botón confirma lo que se ha añadido, con el municipio
encontrado y su punto. **El dispositivo no se crea automáticamente**: vaya a
recogerlo en la pestaña **Descubrir** de la integración.

### Una ubicación fuera de Francia

El código postal es francés por definición: es el registro del Estado francés el
que lo resuelve. Los datos UV son mundiales: para un lugar en el extranjero, deje
vacío el código postal y rellene la **latitud** y la **longitud** en grados
decimales WGS-84. Se acepta la coma decimal (`48,8566`).

## Listar y eliminar sus ubicaciones

- **«Mostrar mis ubicaciones»** lista todo lo configurado, numerado. Cada entrada
  empieza por un «•» seguido de su número.
- **«Eliminar una ubicación»** pide ese número —el que imprime la lista— y
  después una confirmación. Ejecute la acción una vez **sin marcar** la casilla
  para comprobar qué ubicación se eliminaría.

Dos cosas que conviene saber sobre la eliminación:

1. **El dispositivo de Gladys no se elimina.** Una integración no tiene permiso
   para eliminar un dispositivo; solo puede dejar de ofrecerlo. La ubicación
   desaparece de la pestaña «Descubrir» y el dispositivo deja de actualizarse:
   elimínelo usted mismo desde la pestaña **Dispositivos** de la integración si
   ya no lo quiere. El mensaje de eliminación se lo indica.
2. **Los números siguientes suben un puesto.** Al eliminar la ubicación 2 de 4,
   la antigua ubicación 3 pasa a ser la 2. Vuelva a ejecutar «Mostrar mis
   ubicaciones» antes de eliminar otra.

## Qué mide cada dispositivo

| Función                        | Qué es                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| Índice UV                      | El índice ahora mismo, como número entero                                          |
| Índice UV máximo del día       | El pico de hoy: la cifra con la que planificar una tarde                           |
| Índice UV (cielo despejado)    | Lo que sería sin nubes; la diferencia con el índice real es la nubosidad           |
| Nivel de exposición UV         | 0–5, las categorías de la OMS: la función que se comprueba en una escena           |
| Nivel de exposición UV (texto) | Su denominación: «Bajo», «Alto»…                                                   |
| Consejo de protección solar    | La recomendación de la OMS para ese nivel                                          |
| Datos actualizados el          | La hora de la previsión de la que proceden los valores, en la hora local del punto |

### La escala

El **Global Solar UV Index** lo definen la OMS, la OMM, el PNUMA y la ICNIRP. No
tiene límite superior, se expresa como número entero y se lee por categorías:

| Índice UV | Nivel publicado | Denominación | Protección                                         |
| --------- | --------------- | ------------ | -------------------------------------------------- |
| 0         | 0               | Nulo         | Ninguna: no hay radiación                          |
| 1–2       | 1               | Bajo         | No se necesita protección                          |
| 3–5       | 2               | Moderado     | Sombra al mediodía, sombrero, gafas de sol, crema  |
| 6–7       | 3               | Alto         | Evitar el sol entre las 12:00 y las 16:00          |
| 8–10      | 4               | Muy alto     | Evitar salir entre las 12:00 y las 16:00, cubrirse |
| 11+       | 5               | Extremo      | La piel sin protección se quema en pocos minutos   |

El nivel **0** es un añadido de esta integración: el tramo más bajo de la OMS,
«bajo», abarca de 0 a 2, pero «ahora mismo no hay nada de UV» merece su propio
valor en una vivienda: es con lo que se activa una escena al anochecer.

### Un valor que falta nunca es un cero

Cuando el modelo no tiene valor para una ubicación, **no se publica nada** para
esa función y el dispositivo conserva su último valor conocido. Publicar un 0
parecería una puesta de sol en mitad de la tarde y activaría las escenas que lo
esperan.

### ¿Qué antigüedad tienen los datos?

**Datos actualizados el** es la hora de la previsión CAMS de la que proceden los
valores del dispositivo, escrita en la **hora local del punto**: una ubicación en
Sídney y otra en Nantes nunca muestran la misma, por eso está en cada estación y
no en un dispositivo propio.

No es el momento en que la integración preguntó por última vez. La previsión
tiene una resolución horaria, así que leerla tres veces en una hora devuelve tres
veces la misma marca de tiempo, y de eso se trata: le dice la antigüedad de las
cifras, no con qué frecuencia se consultaron. Cuando una actualización falla, no
se publica nada: la marca de tiempo deja de avanzar y la antigüedad se ve en el
panel.

Una breve interrupción de la fuente no cuesta una actualización entera: la
integración lo vuelve a intentar enseguida, dos veces, con unos segundos de
intervalo. Si la fuente sigue sin responder, los **widgets** y la acción de
escena «Leer el índice UV» muestran el último valor conocido —de 3 horas como
máximo— con su propia marca de tiempo, que indica honestamente su antigüedad; los
dispositivos nunca reciben un valor antiguo presentado como nuevo.

«Probar el proveedor UV» termina cada línea con esa misma marca de tiempo, así
que una fuente que responde con la hora de ayer se muestra como lo que es.

## En el panel

El editor del panel (**Panel → Editar → Nuevo widget**) ofrece dos widgets
(Gladys 5.1 o posterior), en la sección **Widgets de integraciones**:

- **Índice UV de una ubicación**: el índice actual, el máximo de hoy y el índice
  con cielo despejado, **la curva de previsión horaria del día** con el pico
  marcado y una línea «ahora», el nivel de exposición y el consejo
  correspondiente. En los ajustes del widget, elija el **dispositivo UV** de la
  ubicación que se va a mostrar: solo se proponen los dispositivos ya añadidos a
  Gladys.
- **Índice UV de las ubicaciones**: una fila por ubicación (10 como máximo), con
  el índice actual y su nivel, en color. Sin ajustes.

Los widgets se muestran en el idioma de quien los mira y siguen cada
actualización de la integración. Si elimina la ubicación de un widget, el widget
lo indica: elija otro dispositivo en sus ajustes.

## En las escenas

La integración añade dos tarjetas al editor de escenas (Gladys 5.1 o posterior),
en la categoría **Integraciones**: un **Activador de integración** y una
**Acción de integración**.

### Disparador «Nivel de exposición UV cambiado»

Se activa cuando el nivel de exposición de una ubicación pasa a otro tramo (de 0
«Nulo» a 5 «Extremo»). Tres filtros, todos opcionales; si se deja vacío, un
filtro lo acepta todo:

- **Ubicación**: el dispositivo UV de la ubicación que se va a vigilar;
- **Nuevo nivel**: uno o varios niveles, por ejemplo 3 y 4;
- **Sentido**: en aumento o en descenso.

Las acciones de la escena pueden reutilizar estos valores: el nombre de la
ubicación, el nuevo nivel y su denominación, el nivel anterior, el sentido
(`rising` o `falling`), el consejo de protección, el índice UV y la hora de los
datos. Mensaje de ejemplo: «UV {{triggerEvent.data.level_label}} en
{{triggerEvent.data.location_name}}: {{triggerEvent.data.advice}}».

Conviene saber:

- La primera lectura tras el arranque de la integración es una referencia y no
  activa nada: un reinicio no es un cambio en el cielo.
- Para reaccionar a un **umbral** («en cuanto el nivel sea al menos 3»), utilice
  en su lugar el activador **Cambio de estado del dispositivo** de la función «Nivel de exposición UV» del
  dispositivo.
- Los textos (denominación, consejo) se escriben en el **idioma de los nombres
  de los dispositivos** elegido en los ajustes generales.

### Acción «Leer el índice UV»

Lee el índice UV de una ubicación cuando la escena la ejecuta y pasa sus valores
a las acciones siguientes: nombre de la ubicación, índice actual, máximo de hoy,
índice con cielo despejado, nivel y denominación, nivel y denominación del pico,
**hora del pico**, consejo de protección y hora de los datos. Un valor que la
fuente no tiene está ausente, nunca se sustituye por 0.

Ejemplo: un disparador «todos los días a las 8:00», después «Leer el índice UV»
sobre su vivienda, y después un mensaje «Pico UV {{0.1.uv_index_max_today}}
({{0.1.level_max_today_label}}) hacia las {{0.1.peak_time}}». Los números (`0.1`)
son los de la acción en su escena: el editor se los propone.

## Ajustes generales

- **Idioma de los nombres de los dispositivos**: todo lo demás que dice esta
  integración ya sigue el idioma de su cuenta de Gladys, pero el nombre de un
  dispositivo y los de sus funciones se guardan tal como están en el momento en
  que crea el dispositivo. Un dispositivo ya añadido **conserva** los nombres con
  los que se creó: cambie el idioma, y después elimine el dispositivo y vuelva a
  añadirlo desde la pestaña «Descubrir» para cambiarle el nombre. Los textos que
  se transmiten a sus escenas (denominación del nivel, consejo) también siguen
  este ajuste. Las opciones son francés (por defecto), inglés, alemán y español.
- **Intervalo de actualización**: 30 minutos por defecto, entre 10 minutos y 6
  horas. La previsión CAMS es horaria: bajar mucho de la media hora no aporta
  nada. Todas las ubicaciones se leen en una sola petición, y un valor solo se
  solicita una vez por hora, haya las actualizaciones y los widgets que haya.

## Comprobar que funciona

El botón **«Probar el proveedor UV»** consulta la fuente en directo para cada
ubicación y muestra el índice obtenido, con el mismo formato numerado que la
lista de ubicaciones. Si una ubicación falla, su línea explica por qué y las
demás responden igualmente. Una ubicación para la que la fuente no tiene valor
indica «sin datos», nunca un nivel. A diferencia de los widgets, este botón nunca
muestra un valor antiguo: una fuente caída aparece como caída.

La pestaña **Supervisión** también muestra el estado de la integración: mientras
no haya ninguna ubicación configurada, indica que hay que añadir una.

## De dónde proceden los datos

- **El índice UV**: el servicio europeo [Copernicus
  CAMS](https://atmosphere.copernicus.eu/), que calcula la dosis UV
  biológicamente eficaz a partir de la columna total de ozono, los aerosoles y la
  nubosidad. Su previsión la redistribuye como datos abiertos
  [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) (CC BY 4.0), sin
  cuenta y sin clave. Cobertura mundial, resolución horaria, cuadrícula de ~45
  km.
- **Los códigos postales**: la [API Découpage
  administratif](https://geo.api.gouv.fr/decoupage-administratif/communes) del
  Estado francés, publicada en data.gouv.fr a partir de la base administrativa
  del INSEE. Proporciona los municipios que abarca un código postal y su
  centroide.

Météo-France también publica una previsión UV francesa, pero su portal exige una
cuenta y un token de aplicación que cada usuario tendría que crear antes de que
la integración mostrara nada. Copernicus es igual de oficial y no pide nada.
