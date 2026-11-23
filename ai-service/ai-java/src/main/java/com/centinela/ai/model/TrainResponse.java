package com.centinela.ai.model;

public record TrainResponse(
        boolean trained,
        int samples,
        Double typeAccuracy,
        Double priorityAccuracy,
        String source,
        String detail
) {
}
