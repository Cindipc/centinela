package com.centinela.ai.service;

import com.centinela.ai.model.ClassificationResponse;
import com.centinela.ai.model.TrainResponse;
import com.centinela.ai.model.TrainingIncident;
import jakarta.annotation.PostConstruct;
import org.deeplearning4j.nn.conf.MultiLayerConfiguration;
import org.deeplearning4j.nn.conf.NeuralNetConfiguration;
import org.deeplearning4j.nn.conf.layers.DenseLayer;
import org.deeplearning4j.nn.conf.layers.OutputLayer;
import org.deeplearning4j.nn.multilayer.MultiLayerNetwork;
import org.deeplearning4j.nn.weights.WeightInit;
import org.deeplearning4j.util.ModelSerializer;
import org.nd4j.evaluation.classification.Evaluation;
import org.nd4j.linalg.activations.Activation;
import org.nd4j.linalg.api.ndarray.INDArray;
import org.nd4j.linalg.dataset.DataSet;
import org.nd4j.linalg.factory.Nd4j;
import org.nd4j.linalg.learning.config.Adam;
import org.nd4j.linalg.lossfunctions.LossFunctions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

@Service
public class ModelService {

    private static final Logger log = LoggerFactory.getLogger(ModelService.class);
    private static final double[] PRIORITY_WEIGHTS = {0.25, 0.5, 0.75, 1.0};

    private final Path modelDirectory;
    private final long seed;
    private MultiLayerNetwork typeModel;
    private MultiLayerNetwork priorityModel;
    private int trainedSamples;
    private Double typeAccuracy;
    private Double priorityAccuracy;
    private String detail;
    private String lastError;

    public ModelService(
            @Value("${ai.model-dir:models}") String modelDirectory,
            @Value("${ai.seed:42}") long seed
    ) {
        this.modelDirectory = Path.of(modelDirectory).toAbsolutePath();
        this.seed = seed;
    }

    @PostConstruct
    public void initialize() {
        try {
            Files.createDirectories(modelDirectory);
            File typeFile = modelDirectory.resolve("type-model.zip").toFile();
            File priorityFile = modelDirectory.resolve("priority-model.zip").toFile();
            if (typeFile.exists() && priorityFile.exists()) {
                typeModel = ModelSerializer.restoreMultiLayerNetwork(typeFile, true);
                priorityModel = ModelSerializer.restoreMultiLayerNetwork(priorityFile, true);
                detail = "Modelos DL4J cargados desde " + modelDirectory;
                log.info(detail);
                return;
            }
            TrainResponse response = trainSamples(
                    SyntheticData.generate(seed, 720),
                    "Modelos iniciales entrenados con dataset sintético."
            );
            detail = response.detail();
            log.info(detail);
        } catch (Throwable error) {
            lastError = error.getClass().getSimpleName() + ": " + error.getMessage();
            log.error("No se pudieron inicializar los modelos DL4J", error);
        }
    }

    public boolean isReady() {
        return typeModel != null && priorityModel != null;
    }

    public synchronized TrainResponse train(List<TrainingIncident> incidents) {
        List<TrainingIncident> clean = clean(incidents);
        if (clean.isEmpty()) {
            clean = SyntheticData.generate(seed, 720);
            return trainSamples(clean, "Sin datos válidos: se entrenó con dataset sintético.");
        }
        if (clean.size() < 40) {
            List<TrainingIncident> augmented = new ArrayList<>(clean);
            augmented.addAll(SyntheticData.generate(seed, 600));
            return trainSamples(
                    augmented,
                    "Pocos ejemplos reales (" + clean.size() + "): se aumentó con dataset sintético."
            );
        }
        return trainSamples(clean, "Modelo entrenado con " + clean.size() + " reportes.");
    }

    private synchronized TrainResponse trainSamples(List<TrainingIncident> incidents, String message) {
        List<double[]> typeFeatures = new ArrayList<>();
        List<Integer> typeLabels = new ArrayList<>();
        List<double[]> priorityFeatures = new ArrayList<>();
        List<Integer> priorityLabels = new ArrayList<>();

        for (TrainingIncident incident : incidents) {
            String type = normalizeLabel(incident.type(), TextFeatures.TYPE_LABELS);
            String priority = normalizeLabel(incident.priority(), TextFeatures.PRIORITY_LABELS);
            if (type == null || priority == null || incident.title() == null || incident.title().isBlank()) {
                continue;
            }
            typeFeatures.add(TextFeatures.typeFeatures(incident.title(), incident.description(), incident.createdAt()));
            typeLabels.add(TextFeatures.TYPE_LABELS.indexOf(type));
            priorityFeatures.add(TextFeatures.priorityFeatures(
                    incident.title(), incident.description(), type, incident.createdAt()
            ));
            priorityLabels.add(TextFeatures.PRIORITY_LABELS.indexOf(priority));
        }

        if (typeFeatures.size() < 20) {
            throw new IllegalStateException("No hay suficientes ejemplos válidos para entrenar.");
        }

        int[] order = shuffledOrder(typeFeatures.size());
        int testSize = Math.max(4, typeFeatures.size() / 5);
        int trainSize = typeFeatures.size() - testSize;

        DataSet typeTrain = dataSet(typeFeatures, typeLabels, order, 0, trainSize, TextFeatures.TYPE_DIM,
                TextFeatures.TYPE_LABELS.size());
        DataSet typeTest = dataSet(typeFeatures, typeLabels, order, trainSize, typeFeatures.size(),
                TextFeatures.TYPE_DIM, TextFeatures.TYPE_LABELS.size());
        DataSet priorityTrain = dataSet(priorityFeatures, priorityLabels, order, 0, trainSize,
                TextFeatures.PRIORITY_DIM, TextFeatures.PRIORITY_LABELS.size());
        DataSet priorityTest = dataSet(priorityFeatures, priorityLabels, order, trainSize,
                typeFeatures.size(), TextFeatures.PRIORITY_DIM, TextFeatures.PRIORITY_LABELS.size());

        MultiLayerNetwork newTypeModel = buildModel(TextFeatures.TYPE_DIM, TextFeatures.TYPE_LABELS.size(), seed);
        MultiLayerNetwork newPriorityModel = buildModel(
                TextFeatures.PRIORITY_DIM, TextFeatures.PRIORITY_LABELS.size(), seed + 1
        );

        for (int epoch = 0; epoch < 18; epoch++) {
            newTypeModel.fit(typeTrain);
            newPriorityModel.fit(priorityTrain);
        }

        double newTypeAccuracy = evaluate(newTypeModel, typeTest, TextFeatures.TYPE_LABELS.size());
        double newPriorityAccuracy = evaluate(
                newPriorityModel, priorityTest, TextFeatures.PRIORITY_LABELS.size()
        );

        try {
            Files.createDirectories(modelDirectory);
            ModelSerializer.writeModel(newTypeModel, modelDirectory.resolve("type-model.zip").toFile(), true);
            ModelSerializer.writeModel(
                    newPriorityModel, modelDirectory.resolve("priority-model.zip").toFile(), true
            );
        } catch (IOException error) {
            log.warn("No se pudieron guardar los modelos DL4J: {}", error.getMessage());
        }

        this.typeModel = newTypeModel;
        this.priorityModel = newPriorityModel;
        this.trainedSamples = typeFeatures.size();
        this.typeAccuracy = newTypeAccuracy;
        this.priorityAccuracy = newPriorityAccuracy;
        this.detail = message;
        this.lastError = null;

        return new TrainResponse(
                true,
                trainedSamples,
                typeAccuracy,
                priorityAccuracy,
                "dl4j",
                detail
        );
    }

    public ClassificationResponse classify(
            String requestedType,
            String title,
            String description,
            String createdAt
    ) {
        if (!isReady()) {
            throw new IllegalStateException(
                    lastError == null
                            ? "Modelos DL4J no disponibles."
                            : "Modelos DL4J no disponibles: " + lastError
            );
        }
        String safeTitle = title == null ? "" : title;
        String safeDescription = description == null ? "" : description;

        INDArray typeInput = Nd4j.create(
                TextFeatures.typeFeatures(safeTitle, safeDescription, createdAt),
                new int[]{1, TextFeatures.TYPE_DIM}
        );
        INDArray typeOutput = typeModel.output(typeInput);
        int typeIndex = Nd4j.argMax(typeOutput, 1).getInt(0);
        String predictedType = TextFeatures.TYPE_LABELS.get(typeIndex);

        INDArray priorityInput = Nd4j.create(
                TextFeatures.priorityFeatures(safeTitle, safeDescription, predictedType, createdAt),
                new int[]{1, TextFeatures.PRIORITY_DIM}
        );
        INDArray priorityOutput = priorityModel.output(priorityInput);
        int priorityIndex = Nd4j.argMax(priorityOutput, 1).getInt(0);
        String predictedPriority = TextFeatures.PRIORITY_LABELS.get(priorityIndex);

        Map<String, Double> probabilities = new LinkedHashMap<>();
        double typeConfidence = typeOutput.getDouble(typeIndex);
        double priorityConfidence = priorityOutput.getDouble(priorityIndex);
        double expectedPriority = 0.0;
        for (int index = 0; index < TextFeatures.PRIORITY_LABELS.size(); index++) {
            double probability = priorityOutput.getDouble(index);
            probabilities.put(TextFeatures.PRIORITY_LABELS.get(index), round(probability));
            expectedPriority += probability * PRIORITY_WEIGHTS[index];
        }
        for (int index = 0; index < TextFeatures.TYPE_LABELS.size(); index++) {
            probabilities.put(TextFeatures.TYPE_LABELS.get(index), round(typeOutput.getDouble(index)));
        }

        String category = Categories.detect(predictedType, safeTitle, safeDescription);
        List<String> reasons = new ArrayList<>();
        reasons.add("DL4J clasificó el reporte como " + predictedType
                + " con " + Math.round(typeConfidence * 100) + "% de confianza.");
        reasons.add("Prioridad estimada " + predictedPriority
                + " (score " + String.format("%.2f", expectedPriority) + ").");
        if ("critical".equals(predictedPriority) || "high".equals(predictedPriority)) {
            reasons.add("Se recomienda atención inmediata y seguimiento cercano.");
        }
        if (requestedType != null && !requestedType.isBlank() && !requestedType.equals(predictedType)) {
            reasons.add("El tipo declarado (" + requestedType + ") difiere de la predicción del modelo.");
        }

        return new ClassificationResponse(
                predictedType,
                predictedPriority,
                round(expectedPriority),
                category,
                round(Math.min(0.99, 0.4 * typeConfidence + 0.6 * priorityConfidence)),
                probabilities,
                "dl4j",
                reasons
        );
    }

    public Map<String, Object> health() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("status", isReady() ? "ok" : "degraded");
        payload.put("service", "centinela-ai-java");
        payload.put("runtime", "Java " + System.getProperty("java.version"));
        payload.put("models", Map.of(
                "type", isReady(),
                "priority", isReady()
        ));
        payload.put("trainedSamples", trainedSamples);
        payload.put("typeAccuracy", typeAccuracy);
        payload.put("priorityAccuracy", priorityAccuracy);
        payload.put("modelDir", modelDirectory.toString());
        payload.put("detail", lastError == null ? detail : lastError);
        return payload;
    }

    private MultiLayerNetwork buildModel(int inputSize, int outputSize, long modelSeed) {
        MultiLayerConfiguration configuration = new NeuralNetConfiguration.Builder()
                .seed(modelSeed)
                .updater(new Adam(0.01))
                .weightInit(WeightInit.XAVIER)
                .list()
                .layer(new DenseLayer.Builder()
                        .nIn(inputSize)
                        .nOut(96)
                        .activation(Activation.RELU)
                        .build())
                .layer(new DenseLayer.Builder()
                        .nIn(96)
                        .nOut(48)
                        .activation(Activation.RELU)
                        .build())
                .layer(new OutputLayer.Builder(LossFunctions.LossFunction.MCXENT)
                        .nIn(48)
                        .nOut(outputSize)
                        .activation(Activation.SOFTMAX)
                        .build())
                .build();
        MultiLayerNetwork network = new MultiLayerNetwork(configuration);
        network.init();
        return network;
    }

    private DataSet dataSet(
            List<double[]> features,
            List<Integer> labels,
            int[] order,
            int from,
            int to,
            int dimension,
            int classes
    ) {
        int rows = to - from;
        INDArray featureMatrix = Nd4j.zeros(rows, dimension);
        INDArray labelMatrix = Nd4j.zeros(rows, classes);
        for (int row = 0; row < rows; row++) {
            int sourceIndex = order[from + row];
            featureMatrix.putRow(row, Nd4j.create(features.get(sourceIndex)));
            labelMatrix.putScalar(row, labels.get(sourceIndex), 1.0);
        }
        return new DataSet(featureMatrix, labelMatrix);
    }

    private double evaluate(MultiLayerNetwork model, DataSet test, int classes) {
        if (test.numExamples() == 0) {
            return 0.0;
        }
        Evaluation evaluation = new Evaluation(classes);
        for (int index = 0; index < test.numExamples(); index++) {
            evaluation.eval(test.getLabels().getRow(index), model.output(test.getFeatures().getRow(index)));
        }
        return round(evaluation.accuracy());
    }

    private List<TrainingIncident> clean(List<TrainingIncident> incidents) {
        if (incidents == null) {
            return List.of();
        }
        List<TrainingIncident> result = new ArrayList<>();
        for (TrainingIncident incident : incidents) {
            if (incident == null || incident.title() == null || incident.title().isBlank()) {
                continue;
            }
            if (normalizeLabel(incident.type(), TextFeatures.TYPE_LABELS) == null) {
                continue;
            }
            if (normalizeLabel(incident.priority(), TextFeatures.PRIORITY_LABELS) == null) {
                continue;
            }
            result.add(incident);
        }
        return result;
    }

    private String normalizeLabel(String value, List<String> labels) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim().toLowerCase();
        return labels.contains(normalized) ? normalized : null;
    }

    private int[] shuffledOrder(int size) {
        List<Integer> indexes = new ArrayList<>();
        for (int index = 0; index < size; index++) {
            indexes.add(index);
        }
        Collections.shuffle(indexes, new Random(seed));
        return indexes.stream().mapToInt(Integer::intValue).toArray();
    }

    private static double round(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
