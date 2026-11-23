package com.centinela.ai.service;

import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class TextFeatures {

    public static final int TEXT_DIM = 512;
    public static final int TYPE_DIM = TEXT_DIM + 3;
    public static final int PRIORITY_DIM = TEXT_DIM + 5;

    public static final List<String> TYPE_LABELS = List.of("seguridad", "equipo");
    public static final List<String> PRIORITY_LABELS = List.of("low", "medium", "high", "critical");

    private TextFeatures() {
    }

    public static String normalize(String value) {
        if (value == null) {
            return "";
        }
        String decomposed = Normalizer.normalize(value, Normalizer.Form.NFD);
        return decomposed.replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
    }

    public static List<String> tokens(String title, String description) {
        String normalized = normalize((title == null ? "" : title) + " " + (description == null ? "" : description));
        List<String> tokens = new ArrayList<>();
        for (String token : normalized.split("[^a-z0-9]+")) {
            if (token.length() >= 3 && !isStopword(token)) {
                tokens.add(token);
            }
        }
        List<String> withBigrams = new ArrayList<>(tokens);
        for (int index = 0; index + 1 < tokens.size(); index++) {
            withBigrams.add(tokens.get(index) + "_" + tokens.get(index + 1));
        }
        return withBigrams;
    }

    private static boolean isStopword(String token) {
        return switch (token) {
            case "del", "las", "los", "una", "unos", "unas", "por", "para", "con", "sin",
                 "que", "como", "esta", "este", "hay", "muy", "mas", "pero", "fue", "han",
                 "reporta", "reportan", "reporte", "reportes", "cerca", "zona", "area",
                 "edificio", "desde", "hace", "sobre", "entre", "cuando", "donde" -> true;
            default -> false;
        };
    }

    public static double[] typeFeatures(String title, String description, String createdAt) {
        double[] vector = new double[TYPE_DIM];
        hashedText(vector, tokens(title, description));
        double[] temporal = temporalFeatures(createdAt);
        vector[TEXT_DIM] = temporal[0];
        vector[TEXT_DIM + 1] = temporal[1];
        vector[TEXT_DIM + 2] = description == null || description.isBlank() ? 0.0 : 1.0;
        return vector;
    }

    public static double[] priorityFeatures(String title, String description, String type, String createdAt) {
        double[] vector = new double[PRIORITY_DIM];
        hashedText(vector, tokens(title, description));
        double[] temporal = temporalFeatures(createdAt);
        vector[TEXT_DIM] = temporal[0];
        vector[TEXT_DIM + 1] = temporal[1];
        vector[TEXT_DIM + 2] = description == null || description.isBlank() ? 0.0 : 1.0;
        if ("equipo".equalsIgnoreCase(type)) {
            vector[TEXT_DIM + 4] = 1.0;
        } else {
            vector[TEXT_DIM + 3] = 1.0;
        }
        return vector;
    }

    private static void hashedText(double[] vector, List<String> tokens) {
        for (String token : tokens) {
            int index = Math.floorMod(token.hashCode(), TEXT_DIM);
            vector[index] += token.contains("_") ? 0.5 : 1.0;
        }
        double norm = 0.0;
        for (int index = 0; index < TEXT_DIM; index++) {
            norm += vector[index] * vector[index];
        }
        if (norm > 0.0) {
            double scale = Math.sqrt(norm);
            for (int index = 0; index < TEXT_DIM; index++) {
                vector[index] /= scale;
            }
        }
    }

    private static double[] temporalFeatures(String createdAt) {
        int hour = 12;
        if (createdAt != null && !createdAt.isBlank()) {
            try {
                hour = OffsetDateTime.parse(createdAt).withOffsetSameInstant(ZoneOffset.UTC).getHour();
            } catch (RuntimeException ignored) {
                hour = 12;
            }
        }
        double angle = 2.0 * Math.PI * hour / 24.0;
        return new double[]{Math.sin(angle), Math.cos(angle)};
    }
}
