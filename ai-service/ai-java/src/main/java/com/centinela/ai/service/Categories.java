package com.centinela.ai.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Categories {

    private static final Map<String, List<String>> SECURITY = new LinkedHashMap<>();
    private static final Map<String, List<String>> EQUIPMENT = new LinkedHashMap<>();

    static {
        SECURITY.put("Robo/Hurto", List.of("robo", "robaron", "hurto", "cartera", "celular", "mochila"));
        SECURITY.put("Agresión/Violencia", List.of("agresion", "golpe", "pelea", "violencia", "amenaza", "arma"));
        SECURITY.put("Acceso no autorizado", List.of("intruso", "acceso no autorizado", "persona ajena", "porton"));
        SECURITY.put("Emergencia médica", List.of("medic", "desmay", "herid", "sangr", "ambulancia", "convuls"));
        SECURITY.put("Incendio", List.of("incendio", "fuego", "humo", "quem", "flama"));
        SECURITY.put("Vehículo", List.of("vehiculo", "auto", "coche", "moto", "estacionamiento"));
        SECURITY.put("Vigilancia", List.of("camara", "alarma", "sensor", "monitoreo", "vigilancia"));
        SECURITY.put("Daño/Vandalismo", List.of("vandal", "rayon", "romp", "dano", "grafiti"));

        EQUIPMENT.put("Red/Conectividad", List.of("internet", "wifi", "red", "conexion", "router", "switch", "cable"));
        EQUIPMENT.put("Energía", List.of("luz", "electric", "energia", "apagon", "bateria", "ups", "corto"));
        EQUIPMENT.put("Hardware", List.of("computadora", "laptop", "monitor", "teclado", "proyector", "impresora"));
        EQUIPMENT.put("Software", List.of("sistema", "aplicacion", "software", "login", "contrasena", "error"));
        EQUIPMENT.put("Infraestructura/Clima", List.of("aire", "clima", "ventilador", "fuga", "agua", "techo"));
        EQUIPMENT.put("Acceso/Credenciales", List.of("credencial", "cuenta", "permiso", "acceso", "usuario"));
    }

    private Categories() {
    }

    public static String detect(String incidentType, String title, String description) {
        String text = TextFeatures.normalize((title == null ? "" : title) + " " + (description == null ? "" : description));
        Map<String, List<String>> catalog = "equipo".equalsIgnoreCase(incidentType) ? EQUIPMENT : SECURITY;
        String best = "equipo".equalsIgnoreCase(incidentType) ? "Soporte técnico" : "Incidente de seguridad";
        int bestHits = 0;
        for (Map.Entry<String, List<String>> entry : catalog.entrySet()) {
            int hits = 0;
            for (String keyword : entry.getValue()) {
                if (text.contains(keyword)) {
                    hits++;
                }
            }
            if (hits > bestHits) {
                best = entry.getKey();
                bestHits = hits;
            }
        }
        return best;
    }
}
