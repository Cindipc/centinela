package com.centinela.ai.service;

import com.centinela.ai.model.TrainingIncident;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public final class SyntheticData {

    private static final List<String[]> SECURITY = List.of(
            new String[]{"Intento de robo en estacionamiento", "Una persona revisa vehículos y forcejea puertas."},
            new String[]{"Persona sospechosa cerca del acceso", "Individuo sin credencial merodea el acceso principal."},
            new String[]{"Agresión entre estudiantes", "Dos estudiantes discutieron y comenzaron a empujarse."},
            new String[]{"Alumno con desmayo en el aula", "El estudiante refiere mareo y dolor de cabeza."},
            new String[]{"Humo en el laboratorio", "Se percibe olor a quemado cerca de una toma de corriente."},
            new String[]{"Cámara de seguridad sin señal", "La cámara del pasillo norte dejó de transmitir."},
            new String[]{"Cristal roto en la cafetería", "Se encontró una ventana dañada y vidrios en el piso."},
            new String[]{"Motocicleta sin placas en el campus", "Vehículo permanece estacionado sin identificación."},
            new String[]{"Botón de pánico activado", "Se activó el botón de pánico del acceso peatonal."},
            new String[]{"Puerta de emergencia abierta", "La puerta lateral está abierta fuera de horario."},
            new String[]{"Amenaza verbal en el estacionamiento", "Una persona amenazó al guardia."},
            new String[]{"Intrusión en área administrativa", "Se observó a una persona ajena revisando escritorios."},
            new String[]{"Pelea en las canchas", "Un grupo de personas discute y empuja a un estudiante."},
            new String[]{"Persona lesionada en escaleras", "Un estudiante cayó y presenta dolor en el tobillo."}
    );

    private static final List<String[]> EQUIPMENT = List.of(
            new String[]{"Sin internet en el laboratorio", "Los equipos no tienen conexión desde hace 20 minutos."},
            new String[]{"Proyector no enciende", "El proyector del aula no responde."},
            new String[]{"Falla de energía en edificio B", "Se fue la luz en dos aulas y el UPS emite alarma."},
            new String[]{"Aire acondicionado sin funcionar", "El aula se encuentra muy calurosa."},
            new String[]{"Computadora no arranca", "La PC del centro de cómputo queda en pantalla negra."},
            new String[]{"Sistema de asistencia caído", "La plataforma muestra error al registrar asistencia."},
            new String[]{"Cuenta bloqueada", "Un docente no puede iniciar sesión en el portal."},
            new String[]{"Cable de red dañado", "El cable del switch está expuesto y se desconecta."},
            new String[]{"Impresora atascada", "La impresora de administración marca error de papel."},
            new String[]{"Fuga de agua en baños", "Hay agua en el pasillo y riesgo de caída."},
            new String[]{"Wifi lento en biblioteca", "Los estudiantes reportan cortes y velocidad baja."},
            new String[]{"Router sin señal", "El router del edificio A tiene luz roja."},
            new String[]{"Contacto eléctrico con chispa", "Se observa chispa y olor a plástico en el taller."},
            new String[]{"Actualización fallida del sistema", "El sistema de inventario muestra error."}
    );

    private static final String[] ZONES = {
            "Acceso principal", "Estacionamiento", "Edificio A - Aulas", "Edificio B - Laboratorios",
            "Biblioteca", "Cafetería", "Centro de Cómputo", "Canchas deportivas",
            "Área administrativa", "Talleres"
    };

    private SyntheticData() {
    }

    public static List<TrainingIncident> generate(long seed, int count) {
        Random random = new Random(seed);
        List<TrainingIncident> incidents = new ArrayList<>();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        for (int index = 0; index < count; index++) {
            boolean security = random.nextDouble() < 0.62;
            String type = security ? "seguridad" : "equipo";
            String[] source = security
                    ? SECURITY.get(random.nextInt(SECURITY.size()))
                    : EQUIPMENT.get(random.nextInt(EQUIPMENT.size()));
            String priority = priorityFor(random, security);
            String suffix = suffixFor(priority, security);
            int hour = security
                    ? new int[]{6, 7, 8, 12, 13, 17, 18, 19, 20, 21, 22, 23, 0, 1}[random.nextInt(14)]
                    : new int[]{7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18}[random.nextInt(12)];
            OffsetDateTime created = now.minusDays(random.nextInt(60))
                    .withHour(hour)
                    .withMinute(random.nextInt(12) * 5)
                    .withSecond(0)
                    .withNano(0);
            incidents.add(new TrainingIncident(
                    type,
                    priority,
                    source[0],
                    source[1] + " " + suffix,
                    ZONES[random.nextInt(ZONES.length)],
                    created.toString(),
                    true
            ));
        }
        return incidents;
    }

    private static String priorityFor(Random random, boolean security) {
        double value = random.nextDouble();
        if (security) {
            if (value < 0.12) {
                return "critical";
            }
            if (value < 0.45) {
                return "high";
            }
            if (value < 0.93) {
                return "medium";
            }
            return "low";
        }
        if (value < 0.05) {
            return "critical";
        }
        if (value < 0.30) {
            return "high";
        }
        if (value < 0.92) {
            return "medium";
        }
        return "low";
    }

    private static String suffixFor(String priority, boolean security) {
        return switch (priority) {
            case "critical" -> security
                    ? "Hay una persona herida y riesgo de incendio."
                    : "Falla total con riesgo eléctrico y cable expuesto.";
            case "high" -> security
                    ? "Situación urgente con amenaza para los estudiantes."
                    : "Afecta la operación y requiere atención urgente.";
            case "low" -> security
                    ? "Reporte leve, solo revisar el área."
                    : "Solicitud leve, revisar cuando sea posible.";
            default -> security
                    ? "Se solicita presencia de seguridad."
                    : "Se requiere revisión del equipo.";
        };
    }
}
