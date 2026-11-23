package com.centinela.ai.model;

import java.util.List;
import java.util.Map;

public record ClassificationResponse(
        String type,
        String priority,
        double priorityScore,
        String category,
        double confidence,
        Map<String, Double> probabilities,
        String source,
        List<String> reasons
) {
}
